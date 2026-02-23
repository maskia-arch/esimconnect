const esimService = require('../services/esimAccess');
const statsService = require('../services/statsService');
const { buildDeliveryMessage } = require('../services/templates');
const logger = require('../services/logger');

// ─── Duplikat-Schutz (In-Memory) ───
// Speichert das ERGEBNIS einer Bestellung, nicht nur den Status.
// Key → { status: 'processing' | 'done' | 'error', result: string|null }
const orderCache = new Map();
const ORDER_TTL = 60 * 60 * 1000; // 1 Stunde

/**
 * Bereinigt abgelaufene Einträge aus dem Cache.
 */
function cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of orderCache) {
        if (now - entry.timestamp > ORDER_TTL) {
            orderCache.delete(key);
        }
    }
}

setInterval(cleanupCache, 5 * 60 * 1000);

/**
 * Erstellt einen eindeutigen Schlüssel für die Bestellung.
 */
function getOrderKey(req) {
    const body = req.body;
    if (body?.invoice_id) return `inv_${body.invoice_id}`;
    if (body?.id) return `id_${body.id}`;

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
 * WICHTIG: Sellauth interpretiert JEDE 200-Antwort als Lieferung.
 * Wir dürfen NUR mit 200 antworten wenn die echten eSIM-Daten drin sind.
 * Bei Fehlern → 500 (Sellauth versucht es ggf. erneut).
 */
async function handleWebhook(req, res) {
    const startTime = Date.now();
    const packageCode = req.query.packageCode;
    const quantity = parseInt(req.body?.item?.quantity, 10) || 1;
    const orderId = req.body?.invoice_id || req.body?.id || 'unknown';

    // ─── Validierung ───
    if (!packageCode) {
        logger.warn('Webhook ohne packageCode empfangen', { orderId });
        return res.status(400).json({ error: 'Missing packageCode query parameter' });
    }

    if (quantity < 1 || quantity > 10) {
        logger.warn('Ungültige Menge', { orderId, quantity });
        return res.status(400).json({ error: 'Invalid quantity (1-10)' });
    }

    // ─── Duplikat-Schutz ───
    const orderKey = getOrderKey(req);
    const cached = orderCache.get(orderKey);

    if (cached) {
        if (cached.status === 'done' && cached.result) {
            // Bestellung war schon erfolgreich → Ergebnis erneut senden
            logger.info('Duplikat-Webhook: Sende gecachtes Ergebnis', { orderId, orderKey });
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(200).send(cached.result);
        }

        if (cached.status === 'processing') {
            // Bestellung läuft gerade → 500 damit Sellauth NICHT als geliefert markiert
            logger.warn('Duplikat-Webhook: Bestellung läuft noch', { orderId, orderKey });
            return res.status(500).json({ error: 'Order still processing, please retry later' });
        }

        // Status 'error' → nochmal versuchen (Eintrag löschen, weiter unten neu verarbeiten)
        orderCache.delete(orderKey);
    }

    // Als "processing" markieren
    orderCache.set(orderKey, { status: 'processing', result: null, timestamp: Date.now() });

    logger.info('Webhook empfangen – Starte eSIM-Bestellung', {
        orderId, packageCode, quantity, orderKey,
    });

    try {
        // ─── eSIM(s) bestellen und auf Provisionierung warten ───
        const esims = await esimService.orderESims(packageCode, quantity);

        if (!esims || esims.length === 0) {
            throw new Error('Keine eSIM-Daten von eSIMAccess erhalten');
        }

        // ─── Liefernachricht erstellen ───
        const deliveryMessage = buildDeliveryMessage(esims);

        // ─── Im Cache speichern für Duplikat-Retries ───
        orderCache.set(orderKey, { status: 'done', result: deliveryMessage, timestamp: Date.now() });

        // ─── Stats aktualisieren ───
        statsService.recordOrder(esims.length);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`Bestellung erfolgreich ausgeliefert in ${duration}s`, {
            orderId, packageCode, esimCount: esims.length,
            iccids: esims.map(e => e.iccid),
        });

        // ─── Antwort an Sellauth → wird dem Kunden als Deliverable angezeigt ───
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(deliveryMessage);

    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.error(`Bestellfehler nach ${duration}s`, {
            orderId, packageCode, quantity, error: error.message,
        });

        statsService.recordError();

        // Cache als Fehler markieren → nächster Retry darf neu verarbeiten
        orderCache.set(orderKey, { status: 'error', result: null, timestamp: Date.now() });

        // 500 → Sellauth markiert NICHT als geliefert
        return res.status(500).json({
            error: 'eSIM provisioning failed',
            message: error.message,
        });
    }
}

module.exports = { handleWebhook };
