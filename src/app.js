const express = require('express');
const config = require('./config');
const logger = require('./services/logger');
const adminAuth = require('./middleware/adminAuth');
const verifySellauthSignature = require('./middleware/auth');
const adminController = require('./controllers/adminController');
const webhookHandler = require('./controllers/webhookHandler');

const app = express();

// ─── Body Parser mit rawBody für Signatur-Verifizierung ───
app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    },
}));

// ─── Trust Proxy (für korrekte IP hinter Render/Heroku/etc.) ───
app.set('trust proxy', 1);

// ─── Request-Logging ───
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        // Nur Webhook- und Admin-Requests loggen, nicht Health-Checks
        if (req.path !== '/' && req.path !== '/health') {
            logger.debug(`${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`, {
                ip: req.ip,
            });
        }
    });
    next();
});

// ─── Routes ───

// Health-Check (für Uptime-Monitoring / Render Keep-Alive)
app.get('/', (req, res) => {
    res.status(200).send('eSIM Bridge V1 — online');
});

app.get('/health', adminController.getHealth);

// Sellauth Dynamic Delivery Webhook
app.post('/webhook', verifySellauthSignature, webhookHandler.handleWebhook);

// Admin Dashboard
app.get('/admin', adminAuth, adminController.getDashboard);

// ─── 404 ───
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ─── Globaler Error Handler ───
app.use((err, req, res, _next) => {
    logger.error('Unbehandelter Express-Fehler', {
        error: err.message,
        stack: err.stack,
        path: req.path,
    });
    res.status(500).json({ error: 'Internal server error' });
});

// ─── Server starten ───
const server = app.listen(config.port, () => {
    logger.info(`eSIM Bridge V1 gestartet auf Port ${config.port}`);
});

// Kein Request-Timeout – eSIMAccess Polling kann Minuten dauern
server.timeout = 0;
server.keepAliveTimeout = 120000; // 2 Minuten

// ─── Graceful Shutdown ───
function shutdown(signal) {
    logger.info(`${signal} empfangen – Server wird heruntergefahren...`);
    server.close(() => {
        logger.info('Server heruntergefahren');
        process.exit(0);
    });

    // Force-Exit nach 30 Sekunden
    setTimeout(() => {
        logger.warn('Force-Exit nach Timeout');
        process.exit(1);
    }, 30000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Unhandled Errors abfangen
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { error: String(reason) });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
});
