const esimService = require('../services/esimAccess');
const statsService = require('../services/statsService');
const { buildDeliveryMessage } = require('../services/templates');
const logger = require('../services/logger');

/**
 * Order-Cache: Speichert Ergebnis pro Bestellung.
 *
 * Schlüssel → {
 *   status: 'processing' | 'done' | 'error',
 *   result: string | null,       // die Deliverable-Nachricht (nur bei 'done')
 *   orderNo: string | null,      // eSIMAccess orderNo (zum Nachverfolgen)
 *   timestamp: number
 * }
 *
 * REGELN:
 * - 'processing' → 500 an Sellauth (NICHT als geliefert markieren)
 * - 'done'       → gecachtes Ergebnis nochmal senden (200)
 * - 'error'      → 500 an Sellauth, NICHT nochmal bestellen (eSIM wurde ja schon gekauft!)
 */
const orderCache = new Map();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 Stunden

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of orderCache) {
        if (now - entry.timestamp > CACHE_TTL) orderCache.delete(key);
    }
}, 10 * 60 * 1000);

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
 * Sellauth Dynamic Delivery Webhook.
 *
 * KRITISCH:
 * - 200 + text = Sellauth zeigt das als Deliverable → NUR mit echten eSIM-Daten!
 * - 500 = Sellauth markiert als fehlgeschlagen → sicher bei Fehlern
 * - NIEMALS doppelt bestellen, auch nicht bei Retry von Sellauth
 */
async function handleWebhook(req, res) {
    const startTime = Date.now();
    const packageCode = req.query.packageCode;
    const quantity = parseInt(req.body?.item?.quantity, 10) || 1;
    const orderId = req.body?.invoice_id || req.body?.id || 'unknown';

    if (!packageCode) {
        return res.status(400).json({ error: 'Missing packageCode' });
    }
    if (quantity < 1 || quantity > 10) {
        return res.status(400).json({ error: 'Invalid quantity' });
    }

    const orderKey = getOrderKey(req);
    const cached = orderCache.get(orderKey);

    // ─── Duplikat-Prüfung ───
    if (cached) {
        switch (cached.status) {
            case 'done':
                // Ergebnis existiert → nochmal liefern
                logger.info('Duplikat: Sende gecachtes Ergebnis', { orderId, orderKey });
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.status(200).send(cached.result);

            case 'processing':
                // Läuft noch → 500 damit Sellauth NICHT als Lieferung wertet
                logger.warn('Duplikat: Noch in Bearbeitung', { orderId, orderKey });
                return res.status(500).json({ error: 'Still processing' });

            case 'error':
                // Fehler war → NICHT nochmal bestellen! eSIM wurde bereits gekauft.
                // 500 zurück, Admin muss manuell eingreifen.
                logger.warn('Duplikat: Vorheriger Versuch fehlgeschlagen, keine Neubestellung', {
                    orderId, orderKey,
                });
                return res.status(500).json({ error: 'Previous attempt failed. Manual intervention needed.' });
        }
    }

    // ─── Neue Bestellung ───
    orderCache.set(orderKey, {
        status: 'processing',
        result: null,
        orderNo: null,
        timestamp: Date.now(),
    });

    logger.info('Webhook → Starte Bestellung', { orderId, packageCode, quantity, orderKey });

    try {
        const esims = await esimService.orderESims(packageCode, quantity);

        if (!esims || esims.length === 0) {
            throw new Error('Keine eSIM-Daten erhalten');
        }

        const deliveryMessage = buildDeliveryMessage(esims);

        // Cache mit Ergebnis aktualisieren
        orderCache.set(orderKey, {
            status: 'done',
            result: deliveryMessage,
            orderNo: null,
            timestamp: Date.now(),
        });

        statsService.recordOrder(esims.length);

        const dur = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`Lieferung OK in ${dur}s`, {
            orderId, esimCount: esims.length,
            iccids: esims.map(e => e.iccid),
        });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(deliveryMessage);

    } catch (error) {
        const dur = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.error(`Fehler nach ${dur}s`, { orderId, packageCode, error: error.message });

        statsService.recordError();

        // NICHT löschen! Verhindert Doppelbestellung bei Retry.
        orderCache.set(orderKey, {
            status: 'error',
            result: null,
            orderNo: null,
            timestamp: Date.now(),
        });

        return res.status(500).json({ error: 'Provisioning failed', message: error.message });
    }
}

module.exports = { handleWebhook };
