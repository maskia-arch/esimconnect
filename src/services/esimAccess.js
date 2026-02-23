const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('./logger');

const BASE_URL = 'https://api.esimaccess.com/api/v1/open';

// ─── Persistent HTTP client with keep-alive (skip TCP/TLS handshake on polls) ───
const http = require('http');
const https = require('https');
const client = axios.create({
    baseURL: BASE_URL,
    headers: {
        'RT-AccessCode': config.esimAccessCode,
        'Content-Type': 'application/json',
    },
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function generateTransactionId() {
    return `SA_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Orders eSIMs and polls until profiles are ready.
 *
 * SPEED OPTIMIZATIONS:
 * - Keep-alive HTTP connection (reused across all polls)
 * - Aggressive early polling: 3s → 3s → 5s → 5s → then 8s intervals
 *   (eSIMAccess docs say "up to 30 seconds", most are faster)
 * - Logging deferred: only minimal logs on hot path
 * - Short axios timeouts to fail fast on network issues
 */
async function orderESims(packageCode, count = 1) {
    const txnId = generateTransactionId();

    // ─── Step 1: Place order ───
    let orderNo;
    try {
        const { data } = await client.post('/esim/order', {
            transactionId: txnId,
            packageInfoList: [{ packageCode, count }],
        }, { timeout: 15000 });

        if (!data.success || data.errorCode) {
            throw new Error(`Order failed: [${data.errorCode}] ${data.errorMsg || data.errorMessage || 'Unknown'}`);
        }

        orderNo = data.obj?.orderNo;
        if (!orderNo) throw new Error(`No orderNo in response: ${JSON.stringify(data)}`);

        logger.info('Order placed', { txnId, orderNo, packageCode, count });

    } catch (err) {
        if (err.response) {
            throw new Error(`Order HTTP ${err.response.status}: ${err.response.data?.errorMsg || err.message}`);
        }
        throw err;
    }

    // ─── Step 2: Aggressive polling ───
    // Schedule: 3s, 3s, 5s, 5s, then 8s repeating (max ~8 minutes total)
    const pollSchedule = [3000, 3000, 5000, 5000];
    const steadyInterval = 8000;
    const maxAttempts = 65;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const wait = attempt <= pollSchedule.length ? pollSchedule[attempt - 1] : steadyInterval;
        await sleep(wait);

        try {
            const { data: qd } = await client.post('/esim/query', {
                orderNo,
                pager: { pageSize: 10, pageNum: 1 },
            }, { timeout: 10000 });

            const errCode = String(qd.errorCode || '');

            // Still allocating — continue
            if (errCode === '200010' || (errCode.startsWith('2000') && errCode !== '0')) {
                if (attempt <= 3) logger.debug(`Poll #${attempt}: ${errCode}`, { txnId });
                continue;
            }

            // Definitive error — abort
            if (errCode && errCode !== '0' && errCode !== 'null' && errCode !== '') {
                throw new Error(`Query error: [${errCode}] ${qd.errorMsg || qd.errorMessage || ''}`);
            }

            // No data yet
            if (!qd.obj) continue;

            // Extract eSIM list (handle different response shapes)
            const esimList = qd.obj.esimList || qd.obj.cards || (Array.isArray(qd.obj) ? qd.obj : null);
            if (!esimList || esimList.length === 0) continue;

            const ready = esimList.filter(e => e.iccid);
            if (ready.length < count) continue;

            // ─── SUCCESS ───
            const result = ready.slice(0, count).map(e => ({
                iccid: e.iccid,
                shortUrl: e.shortUrl || e.qrcodeUrl || null,
            }));

            logger.info(`${result.length} eSIM(s) ready after ${attempt} polls`, {
                txnId, iccids: result.map(e => e.iccid),
            });

            return result;

        } catch (err) {
            if (err.message.startsWith('Query error:')) throw err;

            // Network issues → retry silently
            if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.response?.status >= 500) {
                if (attempt <= 3) logger.debug(`Poll #${attempt} network error, retrying`, { txnId });
                continue;
            }
            if (err.response?.status >= 400) {
                throw new Error(`Query HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
            }
            // Unknown error — retry
            continue;
        }
    }

    throw new Error(`Timeout: eSIMs not ready after ${maxAttempts} polls (orderNo: ${orderNo})`);
}

async function getBalance() {
    const { data } = await client.post('/merchant/balance', {}, { timeout: 10000 });
    return data.obj || data;
}

module.exports = { orderESims, getBalance };
