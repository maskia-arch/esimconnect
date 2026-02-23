const esimService = require('../services/esimAccess');
const statsService = require('../services/statsService');
const { buildDeliveryMessage } = require('../services/templates');
const logger = require('../services/logger');

// ─── Duplikat-Schutz (In-Memory) ───
// Verhindert dass dieselbe Bestellung doppelt verarbeitet wird,
// falls Sellauth den Webhook erneut sendet.
const processingOrders = new Map();
const ORDER_TTL = 30 * 60 * 1000; // 30 Minuten

/**
 * Bereinigt abgelaufene Einträge aus dem Processing-Cache.
 */
function cleanupProcessingCache() {
    const now = Date.now();
    for (const [key, timestamp] of processingOrders) {
        if (now - timestamp > ORDER_TTL) {
            processingOrders.delete(key);
        }
    }
}

// Alle 5 Minuten aufräumen
setInterval(cleanupProcessingCache, 5 * 60 * 1000);

/**
 * Erstellt einen eindeutigen Schlüssel für die Bestellung.
 * Basiert auf Invoice-ID (wenn vorhanden) oder einem Hash des Body.
 */
function getOrderKey(req) {
    const body = req.body;

    // Sellauth sendet Invoice-ID im Body
    if (body?.invoice_id) return `inv_${body.invoice_id}`;
    if (body?.id) return `id_${body.id}`;

    // Fallback: Hash des gesamten Body
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256')
        .update(req.rawBody || JSON.stringify(body))
        .digest('hex')
        .substring(0, 16);
    return `hash_${hash}`;
}

/**
 * Sellauth Dynamic Delivery Webhook Handler.
 * 
 * Flow:
 * 1. Sellauth sendet POST an /webhook?packageCode=XXX nach erfolgreicher Bezahlung
 * 2. Wir bestellen die eSIM(s) bei eSIMAccess
 * 3. Wir pollen die eSIMAccess API bis die eSIM-Profile bereit sind
 * 4. Wir antworten Sellauth mit den eSIM-Daten als plain text
 * 5. Sellauth leitet die Antwort an den Kunden weiter
 * 
 * WICHTIG: Sellauth erwartet eine schnelle Antwort (< 30s default).
 * Da eSIMAccess bis zu 10+ Minuten brauchen kann, muss der Server
 * keep-alive / lange Timeouts unterstützen. Alternativ: server.timeout = 0.
 */
async function handleWebhook(req, res) {
    const startTime = Date.now();
    const packageCode = req.query.packageCode;
    const quantity = parseInt(req.body?.item?.quantity, 10) || 1;
    const orderId = req.body?.invoice_id || req.body?.id || 'unknown';

    // ─── Validierung ───
    if (!packageCode) {
        logger.warn('Webhook ohne packageCode empfangen', {
            orderId,
            query: req.query,
        });
        return res.status(400).json({ error: 'Missing packageCode query parameter' });
    }

    if (quantity < 1 || quantity > 10) {
        logger.warn('Ungültige Menge', { orderId, quantity });
        return res.status(400).json({ error: 'Invalid quantity (1-10)' });
    }

    // ─── Duplikat-Schutz ───
    const orderKey = getOrderKey(req);
    if (processingOrders.has(orderKey)) {
        logger.warn('Duplikat-Webhook erkannt, wird ignoriert', {
            orderId,
            orderKey,
        });
        // 200 zurückgeben damit Sellauth nicht erneut versucht
        return res.status(200).send('Bestellung wird bereits verarbeitet. Bitte warte einen Moment.');
    }
    processingOrders.set(orderKey, Date.now());

    logger.info(`Webhook empfangen – Starte eSIM-Bestellung`, {
        orderId,
        packageCode,
        quantity,
        orderKey,
    });

    try {
        // ─── eSIM(s) bestellen und auf Provisionierung warten ───
        // Bei count > 1 nutzen wir den Batch-Modus von eSIMAccess,
        // anstatt einzelne Bestellungen aufzugeben.
        const esims = await esimService.orderESims(packageCode, quantity);

        if (!esims || esims.length === 0) {
            throw new Error('Keine eSIM-Daten von eSIMAccess erhalten');
        }

        // ─── Liefernachricht erstellen ───
        const deliveryMessage = buildDeliveryMessage(esims);

        // ─── Stats aktualisieren ───
        statsService.recordOrder(esims.length);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`Bestellung erfolgreich ausgeliefert in ${duration}s`, {
            orderId,
            packageCode,
            esimCount: esims.length,
            iccids: esims.map(e => e.iccid),
        });

        // ─── Antwort an Sellauth (wird an Kunden weitergeleitet) ───
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(deliveryMessage);

    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.error(`Bestellfehler nach ${duration}s`, {
            orderId,
            packageCode,
            quantity,
            error: error.message,
        });

        statsService.recordError();

        // Duplikat-Schutz aufheben damit bei Retry verarbeitet wird
        processingOrders.delete(orderKey);

        // Sellauth erhält eine Fehlermeldung,
        // die nicht an den Kunden weitergegeben werden sollte.
        // Bei 500 versucht Sellauth es ggf. erneut.
        return res.status(500).json({
            error: 'eSIM provisioning failed',
            message: error.message,
        });

    }
}

module.exports = { handleWebhook };
