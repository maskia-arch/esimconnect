const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('./logger');

const BASE_URL = 'https://api.esimaccess.com/v1/open';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Erstellt die Standard-Header für eSIMAccess API-Aufrufe.
 */
function getHeaders() {
    return {
        'RT-AccessCode': config.esimAccessCode,
        'Content-Type': 'application/json',
    };
}

/**
 * Generiert eine eindeutige Transaction-ID.
 * Format: SA_{timestamp}_{random_hex}
 */
function generateTransactionId() {
    return `SA_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Bestellt eSIMs bei eSIMAccess.
 * 
 * eSIMAccess API Flow:
 * 1. POST /package/order → Bestellung aufgeben (gibt orderNo zurück)
 * 2. POST /esim/query   → Polling nach eSIM-Daten (ICCID, shortUrl)
 * 
 * Die eSIM-Provisionierung durch den SM-DP+ Server braucht Zeit,
 * daher wird in einem Polling-Loop alle X Sekunden nachgefragt.
 * 
 * @param {string} packageCode - Der eSIMAccess Package-Code (z.B. "CKH993")
 * @param {number} count       - Anzahl der zu bestellenden eSIMs (Standard: 1)
 * @returns {Promise<Array>}   - Array mit eSIM-Objekten { iccid, shortUrl }
 */
async function orderESims(packageCode, count = 1) {
    const transactionId = generateTransactionId();
    const headers = getHeaders();

    logger.info(`eSIM-Bestellung wird aufgegeben`, {
        transactionId,
        packageCode,
        count,
    });

    // ─── Schritt 1: Bestellung aufgeben ───
    let orderNo;
    try {
        const orderResponse = await axios.post(`${BASE_URL}/package/order`, {
            packageCode,
            count,
            transactionId,
        }, {
            headers,
            timeout: 30000,
        });

        const orderData = orderResponse.data;

        if (!orderData.success && orderData.errorCode) {
            throw new Error(
                `eSIMAccess Bestellfehler: [${orderData.errorCode}] ${orderData.errorMsg || 'Unbekannter Fehler'}`
            );
        }

        orderNo = orderData.obj?.orderNo || orderData.orderNo;
        logger.info(`Bestellung aufgegeben`, { transactionId, orderNo });

    } catch (error) {
        if (error.response) {
            const errData = error.response.data;
            logger.error(`eSIMAccess API Fehler bei Bestellung`, {
                transactionId,
                status: error.response.status,
                errorCode: errData?.errorCode,
                errorMsg: errData?.errorMsg,
            });
            throw new Error(
                `eSIMAccess Bestellfehler: ${errData?.errorMsg || error.message}`
            );
        }
        logger.error(`Netzwerkfehler bei eSIMAccess Bestellung`, {
            transactionId,
            error: error.message,
        });
        throw error;
    }

    // ─── Schritt 2: Polling nach eSIM-Profilen ───
    const queryBody = {};
    if (orderNo) {
        queryBody.orderNo = orderNo;
    } else {
        queryBody.transactionId = transactionId;
    }

    let attempts = 0;
    const maxAttempts = config.esimMaxPollAttempts;
    const pollInterval = config.esimPollInterval;

    while (attempts < maxAttempts) {
        await sleep(pollInterval);
        attempts++;

        try {
            const queryResponse = await axios.post(`${BASE_URL}/esim/query`, queryBody, {
                headers,
                timeout: 15000,
            });

            const queryData = queryResponse.data;

            // Prüfe ob die Antwort erfolgreich ist
            if (!queryData.success && queryData.errorCode) {
                // Bestimmte Fehlercodes bedeuten "noch nicht fertig"
                if (queryData.errorCode === 'ORDER_IN_PROGRESS' ||
                    queryData.errorCode === 'PROFILE_NOT_READY') {
                    logger.debug(`eSIM noch nicht bereit (Versuch ${attempts}/${maxAttempts})`, {
                        transactionId,
                        errorCode: queryData.errorCode,
                    });
                    continue;
                }
                throw new Error(
                    `eSIMAccess Query-Fehler: [${queryData.errorCode}] ${queryData.errorMsg || ''}`
                );
            }

            // eSIM-Liste extrahieren (verschiedene API-Antwortformate)
            const esimList = queryData.obj?.esimList
                || queryData.obj?.cards
                || (Array.isArray(queryData.obj) ? queryData.obj : null);

            if (!esimList || esimList.length === 0) {
                logger.debug(`Noch keine eSIMs verfügbar (Versuch ${attempts}/${maxAttempts})`, {
                    transactionId,
                });
                continue;
            }

            // Prüfe ob alle bestellten eSIMs eine ICCID haben
            const readyEsims = esimList.filter(e => e.iccid);

            if (readyEsims.length < count) {
                logger.debug(`${readyEsims.length}/${count} eSIMs bereit (Versuch ${attempts}/${maxAttempts})`, {
                    transactionId,
                });
                continue;
            }

            // Alle eSIMs sind bereit
            const result = readyEsims.slice(0, count).map(esim => ({
                iccid: esim.iccid,
                shortUrl: esim.shortUrl || esim.qrcodeUrl || null,
            }));

            logger.info(`${result.length} eSIM(s) erfolgreich provisioniert`, {
                transactionId,
                iccids: result.map(e => e.iccid),
            });

            return result;

        } catch (error) {
            // Bei Netzwerk-Timeouts weiter pollen
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                logger.warn(`Query-Timeout (Versuch ${attempts}/${maxAttempts})`, {
                    transactionId,
                });
                continue;
            }

            // Andere Fehler nur loggen und weiter versuchen,
            // es sei denn es ist ein definitiver API-Fehler
            if (error.response?.status >= 400 && error.response?.status < 500) {
                throw error;
            }

            logger.warn(`Query-Fehler (Versuch ${attempts}/${maxAttempts})`, {
                transactionId,
                error: error.message,
            });
        }
    }

    // Timeout erreicht
    const timeoutSec = (maxAttempts * pollInterval / 1000).toFixed(0);
    logger.error(`eSIM-Provisionierung Timeout nach ${timeoutSec}s`, {
        transactionId,
        orderNo,
        attempts: maxAttempts,
    });
    throw new Error(
        `eSIM-Provisionierung Timeout: Nach ${timeoutSec} Sekunden keine eSIM-Daten erhalten.`
    );
}

/**
 * Prüft das Guthaben des eSIMAccess-Accounts.
 * @returns {Promise<{balance: number, currencyCode: string}>}
 */
async function getBalance() {
    try {
        const response = await axios.post(`${BASE_URL}/merchant/balance`, {}, {
            headers: getHeaders(),
            timeout: 10000,
        });
        return response.data.obj || response.data;
    } catch (error) {
        logger.error('Fehler beim Abrufen des eSIMAccess-Guthabens', {
            error: error.message,
        });
        throw error;
    }
}

module.exports = {
    orderESims,
    getBalance,
};
