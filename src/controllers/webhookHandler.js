const esimService = require('../services/esimAccess');
const statsService = require('../services/statsService');
const { buildDeliveryMessage } = require('../services/templates');
const logger = require('../services/logger');

/**
 * Order cache: prevents duplicate orders and stores results.
 *
 * Key → {
 *   status: 'processing' | 'done' | 'error',
 *   result: string | null,    // deliverable text (only when 'done')
 *   timestamp: number
 * }
 *
 * RULES:
 * - 'processing' → 500 to Sellauth (don't mark as delivered)
 * - 'done'       → send cached result again (200)
 * - 'error'      → 500, do NOT re-order (eSIM was already purchased!)
 */
const orderCache = new Map();

setInterval(() => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2h TTL
    for (const [k, v] of orderCache) {
        if (v.timestamp < cutoff) orderCache.delete(k);
    }
}, 10 * 60 * 1000);

function getOrderKey(req) {
    if (req.body?.invoice_id) return `inv_${req.body.invoice_id}`;
    if (req.body?.id) return `id_${req.body.id}`;
    const crypto = require('crypto');
    return `hash_${crypto.createHash('sha256').update(req.rawBody || JSON.stringify(req.body)).digest('hex').substring(0, 16)}`;
}

/**
 * SPEED-OPTIMIZED Webhook Handler
 *
 * Critical path (blocks response):
 *   signature check → cache check → order eSIM → poll → build message → send 200
 *
 * Deferred (AFTER response sent):
 *   logging, stats recording, cache update
 *
 * This means the customer gets their eSIM data as fast as physically possible.
 */
async function handleWebhook(req, res) {
    const t0 = Date.now();
    const packageCode = req.query.packageCode;
    const quantity = parseInt(req.body?.item?.quantity, 10) || 1;
    const orderId = req.body?.invoice_id || req.body?.id || 'unknown';
    const orderKey = getOrderKey(req);

    // ─── Validate (fast, no I/O) ───
    if (!packageCode) return res.status(400).json({ error: 'Missing packageCode' });
    if (quantity < 1 || quantity > 10) return res.status(400).json({ error: 'Invalid quantity' });

    // ─── Duplicate check (fast, in-memory) ───
    const cached = orderCache.get(orderKey);
    if (cached) {
        if (cached.status === 'done') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.status(200).send(cached.result);
            // Deferred log
            setImmediate(() => logger.info('Duplicate: sent cached result', { orderId, orderKey }));
            return;
        }
        if (cached.status === 'processing') {
            return res.status(500).json({ error: 'Still processing' });
        }
        // status === 'error': don't re-order
        return res.status(500).json({ error: 'Previous attempt failed. Manual intervention needed.' });
    }

    // ─── Mark as processing ───
    orderCache.set(orderKey, { status: 'processing', result: null, timestamp: Date.now() });

    try {
        // ─── Order + Poll (this is the unavoidable wait) ───
        const esims = await esimService.orderESims(packageCode, quantity);

        if (!esims || esims.length === 0) {
            throw new Error('No eSIM data received');
        }

        // ─── Build message (fast, in-memory) ───
        const deliveryMessage = buildDeliveryMessage(esims);

        // ─── SEND RESPONSE FIRST — customer gets data NOW ───
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(200).send(deliveryMessage);

        // ─── Everything below runs AFTER the response is sent ───
        setImmediate(() => {
            // Update cache
            orderCache.set(orderKey, { status: 'done', result: deliveryMessage, timestamp: Date.now() });

            // Record stats (async disk write, never blocks)
            statsService.recordOrder(esims.length);

            // Log success
            const dur = ((Date.now() - t0) / 1000).toFixed(1);
            logger.info(`Delivered ${esims.length} eSIM(s) in ${dur}s`, {
                orderId,
                packageCode,
                iccids: esims.map(e => e.iccid),
            });
        });

    } catch (error) {
        // Error: send 500 first, then log
        res.status(500).json({ error: 'Provisioning failed', message: error.message });

        setImmediate(() => {
            orderCache.set(orderKey, { status: 'error', result: null, timestamp: Date.now() });
            statsService.recordError();
            const dur = ((Date.now() - t0) / 1000).toFixed(1);
            logger.error(`Failed after ${dur}s`, { orderId, packageCode, error: error.message });
        });
    }
}

module.exports = { handleWebhook };
