const crypto = require('crypto');
const config = require('../config');

function adminAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).send('Authentication required');
    }

    const decoded = Buffer.from(auth.slice(6), 'base64').toString();
    const [user, pass] = decoded.split(':');

    const userOk = user === config.admin.username;
    const passOk = pass && crypto.timingSafeEqual(
        Buffer.from(pass, 'utf8'),
        Buffer.from(config.admin.password, 'utf8')
    );

    if (userOk && passOk) return next();

    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Invalid credentials');
}

module.exports = adminAuth;
