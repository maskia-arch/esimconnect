const crypto = require('crypto');
const logger = require('../services/logger');

/**
 * Sellauth Dynamic Delivery Webhook Signatur-Verifizierung.
 * 
 * Sellauth sendet einen HMAC-SHA256-Hash des Request-Body im Header 'x-signature'.
 * Der Hash wird mit dem Webhook-Secret aus dem Sellauth-Dashboard erzeugt.
 * 
 * Wir verwenden den rohen Body-Buffer für die korrekte Berechnung,
 * da JSON.stringify() die Byte-Reihenfolge verändern kann.
 */
function verifySellauthSignature(req, res, next) {
    const signatureHeader = req.headers['x-signature'];
    const secret = process.env.SELLAUTH_SECRET;

    if (!signatureHeader) {
        logger.warn('Webhook ohne x-signature Header empfangen', {
            ip: req.ip,
            path: req.originalUrl,
        });
        return res.status(401).json({ error: 'Missing signature' });
    }

    if (!secret) {
        logger.error('SELLAUTH_SECRET ist nicht konfiguriert');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // rawBody wird vom express.json() verify-Callback gesetzt
    const payload = req.rawBody;
    if (!payload) {
        logger.error('rawBody ist leer – express.json verify-Callback fehlt?');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');

    try {
        const sigBuf = Buffer.from(signatureHeader, 'utf8');
        const digBuf = Buffer.from(digest, 'utf8');

        if (sigBuf.length !== digBuf.length || !crypto.timingSafeEqual(sigBuf, digBuf)) {
            logger.warn('Ungültige Webhook-Signatur', {
                ip: req.ip,
                path: req.originalUrl,
            });
            return res.status(401).json({ error: 'Invalid signature' });
        }

        return next();
    } catch (error) {
        logger.error('Fehler bei Signatur-Verifizierung', { error: error.message });
        return res.status(401).json({ error: 'Signature verification failed' });
    }
}

module.exports = verifySellauthSignature;
