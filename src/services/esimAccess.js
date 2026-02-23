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
 * Order: POST /esim/order
 *   Body: { transactionId, packageInfoList: [{ packageCode, count }] }
 *   Response: { success: true, obj: { orderNo: "B23..." } }
 *
 * Query: POST /esim/query
 *   Body: { orderNo: "B23..." }
 *   Wenn noch nicht fertig: { success: false, errorCode: "200010", errorMsg: "..." }
 *   Wenn fertig: { success: true, obj: { esimList: [{ iccid, shortUrl, ... }] } }
 */
async function orderESims(packageCode, count = 1) {
    const transactionId = generateTransactionId();
    const headers = getHeaders();

    logger.info('eSIM-Bestellung wird aufgegeben', { transactionId, packageCode, count });

    // ─── Schritt 1: Bestellung aufgeben ───
    let orderNo;
    try {
        const orderResponse = await axios.post(`${BASE_URL}/esim/order`, {
            transactionId: transactionId,
            packageInfoList: [{
                packageCode: packageCode,
                count: count,
            }]
        }, { headers, timeout: 30000 });

        const orderData = orderResponse.data;

        logger.info('Order-Response erhalten', {
            transactionId,
            success: orderData.success,
            errorCode: orderData.errorCode || null,
            objStr: JSON.stringify(orderData.obj || null),
        });

        if (orderData.success === false && orderData.errorCode) {
            throw new Error(`eSIMAccess Bestellfehler: [${orderData.errorCode}] ${orderData.errorMsg || 'Unbekannter Fehler'}`);
        }

        orderNo = orderData.obj?.orderNo;
        if (!orderNo) {
            logger.warn('Keine orderNo in Response', {
                transactionId,
                fullResponse: JSON.stringify(orderData),
            });
        } else {
            logger.info('Bestellung aufgegeben', { transactionId, orderNo });
        }

    } catch (error) {
        if (error.response) {
            const errData = error.response.data;
            logger.error('eSIMAccess API Fehler bei Bestellung', {
                transactionId,
                status: error.response.status,
                responseBody: JSON.stringify(errData),
            });
            throw new Error(`eSIMAccess Bestellfehler: ${errData?.errorMsg || errData?.errorMessage || error.message}`);
        }
        logger.error('Netzwerkfehler bei eSIMAccess Bestellung', { transactionId, error: error.message });
        throw error;
    }

    // ─── Schritt 2: Polling nach eSIM-Profilen ───
    const queryBody = orderNo
        ? { orderNo: orderNo }
        : { transactionId: transactionId };

    let attempts = 0;
    const maxAttempts = config.esimMaxPollAttempts;
    const pollInterval = config.esimPollInterval;

    logger.info('Starte Polling', {
        transactionId,
        orderNo: orderNo || 'N/A',
        queryBodyStr: JSON.stringify(queryBody),
        maxAttempts,
        pollInterval,
    });

    while (attempts < maxAttempts) {
        await sleep(pollInterval);
        attempts++;

        try {
            const queryResponse = await axios.post(`${BASE_URL}/esim/query`, queryBody, {
                headers,
                timeout: 15000,
            });

            const qd = queryResponse.data;

            // ─── Immer loggen bei den ersten 5 Versuchen, dann alle 10 ───
            if (attempts <= 5 || attempts % 10 === 0) {
                logger.info(`Poll #${attempts}/${maxAttempts} Response`, {
                    transactionId,
                    success: qd.success,
                    errorCode: qd.errorCode || 'null',
                    errorMsg: qd.errorMsg || qd.errorMessage || 'null',
                    hasObj: !!qd.obj,
                    objKeys: qd.obj ? Object.keys(qd.obj).join(',') : 'N/A',
                    responseSnippet: JSON.stringify(qd).substring(0, 600),
                });
            }

            // ─── Noch nicht fertig? (errorCode vorhanden) ───
            const errCode = String(qd.errorCode || '');
            if (errCode && errCode !== '0' && errCode !== 'null') {
                // 200010 = SM-DP+ still allocating → weiter pollen
                if (errCode === '200010') {
                    logger.debug(`SM-DP+ allocating (Poll #${attempts})`, { transactionId });
                    continue;
                }
                // Alles was mit 2000 anfängt → wahrscheinlich temporär
                if (errCode.startsWith('2000')) {
                    logger.debug(`Temporärer Code ${errCode} (Poll #${attempts})`, { transactionId });
                    continue;
                }
                // Alles andere → abbrechen
                logger.error('eSIMAccess Query definitiver Fehler', {
                    transactionId, errorCode: errCode,
                    errorMsg: qd.errorMsg || qd.errorMessage,
                });
                throw new Error(`eSIMAccess Query-Fehler: [${errCode}] ${qd.errorMsg || qd.errorMessage || ''}`);
            }

            // ─── success ist true (oder kein errorCode) → eSIM-Daten suchen ───
            if (!qd.obj) {
                logger.debug(`Kein obj in Response (Poll #${attempts})`, { transactionId });
                continue;
            }

            // eSIM-Liste extrahieren – robuste Suche in verschiedenen Strukturen
            let esimList = null;

            if (Array.isArray(qd.obj.esimList) && qd.obj.esimList.length > 0) {
                esimList = qd.obj.esimList;
            } else if (Array.isArray(qd.obj.cards) && qd.obj.cards.length > 0) {
                esimList = qd.obj.cards;
            } else if (Array.isArray(qd.obj) && qd.obj.length > 0) {
                esimList = qd.obj;
            }

            if (!esimList || esimList.length === 0) {
                logger.debug(`Keine eSIM-Liste gefunden (Poll #${attempts})`, {
                    transactionId,
                    objType: typeof qd.obj,
                    objIsArray: Array.isArray(qd.obj),
                    objKeysStr: typeof qd.obj === 'object' ? Object.keys(qd.obj).join(',') : 'N/A',
                });
                continue;
            }

            // ─── ICCID prüfen ───
            const readyEsims = esimList.filter(e => e.iccid);

            if (readyEsims.length === 0) {
                logger.debug(`eSIMs ohne ICCID (Poll #${attempts})`, {
                    transactionId,
                    firstEsimKeys: Object.keys(esimList[0]).join(','),
                    firstEsim: JSON.stringify(esimList[0]).substring(0, 300),
                });
                continue;
            }

            if (readyEsims.length < count) {
                logger.debug(`${readyEsims.length}/${count} bereit (Poll #${attempts})`, { transactionId });
                continue;
            }

            // ─── ERFOLG ───
            const result = readyEsims.slice(0, count).map(esim => ({
                iccid: esim.iccid,
                shortUrl: esim.shortUrl || esim.qrcodeUrl || null,
            }));

            logger.info(`${result.length} eSIM(s) provisioniert nach ${attempts} Polls`, {
                transactionId,
                iccids: result.map(e => e.iccid),
                urls: result.map(e => e.shortUrl),
            });

            return result;

        } catch (error) {
            // Selbst geworfene Fehler → nicht weiter pollen
            if (error.message.startsWith('eSIMAccess Query-Fehler:')) {
                throw error;
            }
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                logger.warn(`Query-Timeout (Poll #${attempts})`, { transactionId });
                continue;
            }
            if (error.response?.status >= 500) {
                logger.warn(`Query 5xx (Poll #${attempts})`, { transactionId, status: error.response.status });
                continue;
            }
            if (error.response?.status >= 400) {
                logger.error(`Query ${error.response.status}`, {
                    transactionId,
                    responseBody: JSON.stringify(error.response.data),
                });
                throw error;
            }
            logger.warn(`Query-Fehler (Poll #${attempts})`, { transactionId, error: error.message });
        }
    }

    const timeoutSec = (maxAttempts * pollInterval / 1000).toFixed(0);
    logger.error(`Timeout nach ${timeoutSec}s`, { transactionId, orderNo, attempts: maxAttempts });
    throw new Error(`eSIM-Provisionierung Timeout: Nach ${timeoutSec} Sekunden keine eSIM-Daten erhalten.`);
}

async function getBalance() {
    try {
        const response = await axios.post(`${BASE_URL}/merchant/balance`, {}, {
            headers: getHeaders(),
            timeout: 10000,
        });
        return response.data.obj || response.data;
    } catch (error) {
        logger.error('Fehler beim Abrufen des eSIMAccess-Guthabens', { error: error.message });
        throw error;
    }
}

module.exports = { orderESims, getBalance };
