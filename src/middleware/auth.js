const crypto = require('crypto');

/**
 * Sellauth HMAC-SHA256 signature verification.
 * OPTIMIZED: No logger import, no I/O on the critical path.
 * Failures are rare and logged by the global error handler.
 */
function verifySellauthSignature(req, res, next) {
    const sig = req.headers['x-signature'];
    const secret = process.env.SELLAUTH_SECRET;

    if (!sig) return res.status(401).json({ error: 'Missing signature' });
    if (!secret) return res.status(500).json({ error: 'Server config error' });

    const payload = req.rawBody;
    if (!payload) return res.status(500).json({ error: 'Server config error' });

    const digest = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    try {
        const sigBuf = Buffer.from(sig, 'utf8');
        const digBuf = Buffer.from(digest, 'utf8');

        if (sigBuf.length !== digBuf.length || !crypto.timingSafeEqual(sigBuf, digBuf)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        next();
    } catch {
        return res.status(401).json({ error: 'Signature verification failed' });
    }
}

module.exports = verifySellauthSignature;
