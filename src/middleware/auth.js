const crypto = require('crypto');

function verifySellauthSignature(req, res, next) {
    const signatureHeader = req.headers['x-signature'];
    const secret = process.env.SELLAUTH_SECRET;

    if (!signatureHeader || !secret) {
        return res.status(401).send('Unauthorized');
    }

    const payload = req.rawBody ? req.rawBody : JSON.stringify(req.body);
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');

    try {
        const safeSignature = Buffer.from(signatureHeader);
        const safeDigest = Buffer.from(digest);

        if (safeSignature.length === safeDigest.length && crypto.timingSafeEqual(safeSignature, safeDigest)) {
            return next();
        } else {
            return res.status(401).send('Invalid Signature');
        }
    } catch (error) {
        return res.status(401).send('Invalid Signature');
    }
}

module.exports = verifySellauthSignature;
