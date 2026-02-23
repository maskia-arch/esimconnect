const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('./logger');

const BASE_URL = 'https://api.esimaccess.com/api/v1/open';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getHeaders() {
    return {
        'RT-AccessCode': config.esimAccessCode,
        'Content-Type': 'application/json',
    };
}

function generateTransactionId() {
    return `SA_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Bestellt eSIMs bei eSIMAccess und pollt bis die Profile bereit sind.
 *
 * === ORDER ===
 * POST /esim/order
 * Body: { transactionId, packageInfoList: [{ packageCode, count }] }
 * Response: { success: true, obj: { orderNo: "B23..." } }
 *
 * === QUERY ===
 * POST /esim/query
 * Body: { orderNo: "B23...", pager: { pageSize: 10, pageNum: 1 } }
 *                             ^^^^^ MANDATORY laut API-Doku!
 *
 * Wenn noch nicht fertig: errorCode "200010" = "Profile is being downloaded for the order"
 * Wenn fertig: { success: true, obj: { esimList: [...], pager: {...} } }
 */
async function orderESims(packageCode, count = 1) {
    const transactionId = generateTransactionId();
    const headers = getHeaders();

    logger.info('eSIM-Bestellung wird aufgegeben', { transactionId, packageCode, count });

    // ─── Schritt 1: Bestellung aufgeben ───
    let orderNo;
    try {
        const orderResponse = await axios.post(`${BASE_URL}/esim/order`, {
            transactionId,
            packageInfoList: [{
                packageCode,
                count,
            }]
        }, { headers, timeout: 30000 });

        const od = orderResponse.data;

        logger.info('Order-Response', {
            transactionId,
            success: od.success,
            errorCode: od.errorCode || 'null',
            orderNo: od.obj?.orderNo || 'N/A',
        });

        if (od.success === false || od.errorCode) {
            throw new Error(`Bestellfehler: [${od.errorCode}] ${od.errorMsg || od.errorMessage || 'Unbekannt'}`);
        }

        orderNo = od.obj?.orderNo;
        if (!orderNo) {
            throw new Error(`Keine orderNo erhalten. Response: ${JSON.stringify(od)}`);
        }

    } catch (error) {
        if (error.response) {
            logger.error('eSIMAccess Order HTTP-Fehler', {
                transactionId,
                status: error.response.status,
                body: JSON.stringify(error.response.data),
            });
            throw new Error(`Bestellfehler: ${error.response.data?.errorMsg || error.message}`);
        }
        throw error;
    }

    // ─── Schritt 2: Polling nach eSIM-Profilen ───
    let attempts = 0;
    const maxAttempts = config.esimMaxPollAttempts;
    const pollInterval = config.esimPollInterval;

    logger.info('Starte Polling', { transactionId, orderNo, maxAttempts, pollInterval });

    while (attempts < maxAttempts) {
        await sleep(pollInterval);
        attempts++;

        try {
            const qr = await axios.post(`${BASE_URL}/esim/query`, {
                orderNo,
                pager: {
                    pageSize: 10,
                    pageNum: 1,
                },
            }, { headers, timeout: 15000 });

            const qd = qr.data;
            const errCode = String(qd.errorCode || '');

            // Log bei ersten 5 + dann alle 10
            if (attempts <= 5 || attempts % 10 === 0) {
                logger.info(`Poll #${attempts}`, {
                    transactionId,
                    success: qd.success,
                    errorCode: errCode || 'null',
                    hasObj: !!qd.obj,
                    snippet: JSON.stringify(qd).substring(0, 800),
                });
            }

            // ─── Noch nicht fertig? ───
            // 200010 = "Profile is being downloaded for the order"
            if (errCode === '200010') {
                continue;
            }

            // Andere 2000xx Codes → temporär, weiter pollen
            if (errCode && errCode.startsWith('2000') && errCode !== '0') {
                logger.debug(`Temporärer Code ${errCode} (Poll #${attempts})`, { transactionId });
                continue;
            }

            // Definitiver Fehler (nicht 2000xx und nicht leer)
            if (errCode && errCode !== '0' && errCode !== 'null' && errCode !== '') {
                throw new Error(`Query-Fehler: [${errCode}] ${qd.errorMsg || qd.errorMessage || ''}`);
            }

            // ─── Erfolg → eSIM-Daten extrahieren ───
            if (!qd.obj) continue;

            const esimList = qd.obj.esimList
                || qd.obj.cards
                || (Array.isArray(qd.obj) ? qd.obj : null);

            if (!esimList || esimList.length === 0) {
                if (attempts <= 5) {
                    logger.debug(`Leere esimList (Poll #${attempts})`, {
                        transactionId,
                        objKeys: Object.keys(qd.obj).join(','),
                    });
                }
                continue;
            }

            const ready = esimList.filter(e => e.iccid);
            if (ready.length < count) {
                logger.debug(`${ready.length}/${count} bereit (Poll #${attempts})`, { transactionId });
                continue;
            }

            // ─── ERFOLG ───
            const result = ready.slice(0, count).map(e => ({
                iccid: e.iccid,
                shortUrl: e.shortUrl || e.qrcodeUrl || null,
            }));

            logger.info(`${result.length} eSIM(s) bereit nach ${attempts} Polls`, {
                transactionId,
                iccids: result.map(e => e.iccid),
                urls: result.map(e => e.shortUrl),
            });

            return result;

        } catch (error) {
            if (error.message.startsWith('Query-Fehler:')) throw error;

            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                logger.warn(`Timeout (Poll #${attempts})`, { transactionId });
                continue;
            }
            if (error.response?.status >= 500) {
                logger.warn(`5xx (Poll #${attempts})`, { transactionId });
                continue;
            }
            if (error.response?.status >= 400) {
                logger.error(`4xx (Poll #${attempts})`, {
                    transactionId, body: JSON.stringify(error.response.data),
                });
                throw error;
            }
            logger.warn(`Fehler (Poll #${attempts}): ${error.message}`, { transactionId });
        }
    }

    const secs = (maxAttempts * pollInterval / 1000).toFixed(0);
    throw new Error(`Timeout: ${secs}s ohne eSIM-Daten (orderNo: ${orderNo})`);
}

async function getBalance() {
    const response = await axios.post(`${BASE_URL}/merchant/balance`, {}, {
        headers: getHeaders(), timeout: 10000,
    });
    return response.data.obj || response.data;
}

module.exports = { orderESims, getBalance };
