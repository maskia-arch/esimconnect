const crypto = require('crypto');
const logger = require('../services/logger');

/**
 * HTTP Basic Auth für das Admin-Dashboard.
 * Timing-safe Vergleich schützt vor Timing-Attacken.
 */
function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="eSIM Bot Admin"');
        return res.status(401).send('Zugriff verweigert: Bitte einloggen.');
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const separatorIndex = credentials.indexOf(':');

    if (separatorIndex === -1) {
        res.setHeader('WWW-Authenticate', 'Basic realm="eSIM Bot Admin"');
        return res.status(401).send('Zugriff verweigert: Ungültige Zugangsdaten.');
    }

    const providedUser = credentials.substring(0, separatorIndex);
    const providedPass = credentials.substring(separatorIndex + 1);

    const expectedUser = process.env.ADMIN_USERNAME || 'admin';
    const expectedPass = process.env.ADMIN_PASSWORD;

    if (!expectedPass) {
        logger.error('ADMIN_PASSWORD ist nicht konfiguriert');
        return res.status(500).send('Server-Konfigurationsfehler.');
    }

    try {
        // SHA-256 Hash beider Werte auf gleiche Länge bringen für timingSafeEqual
        const hashProvUser = crypto.createHash('sha256').update(providedUser).digest();
        const hashExpUser = crypto.createHash('sha256').update(expectedUser).digest();
        const hashProvPass = crypto.createHash('sha256').update(providedPass).digest();
        const hashExpPass = crypto.createHash('sha256').update(expectedPass).digest();

        const userMatch = crypto.timingSafeEqual(hashProvUser, hashExpUser);
        const passMatch = crypto.timingSafeEqual(hashProvPass, hashExpPass);

        if (userMatch && passMatch) {
            return next();
        }

        res.setHeader('WWW-Authenticate', 'Basic realm="eSIM Bot Admin"');
        return res.status(401).send('Zugriff verweigert: Falsche Zugangsdaten.');
    } catch (err) {
        logger.error('Fehler bei Admin-Authentifizierung', { error: err.message });
        res.setHeader('WWW-Authenticate', 'Basic realm="eSIM Bot Admin"');
        return res.status(401).send('Zugriff verweigert.');
    }
}

module.exports = adminAuth;
