const express = require('express');
const config = require('./config');
const logger = require('./services/logger');
const adminAuth = require('./middleware/adminAuth');
const verifySellauthSignature = require('./middleware/auth');
const adminController = require('./controllers/adminController');
const webhookHandler = require('./controllers/webhookHandler');

const app = express();

// ─── Body parser with rawBody for signature verification ───
app.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.set('trust proxy', 1);

// ─── Routes (NO request-logging middleware on webhook path) ───

// Health check
app.get('/', (_req, res) => res.send('eSIM Bridge V1 — online'));
app.get('/health', adminController.getHealth);

// Webhook — minimal middleware chain: json parse → signature → handler
app.post('/webhook', verifySellauthSignature, webhookHandler.handleWebhook);

// Admin (logging here is fine, not on critical path)
app.get('/admin', adminAuth, adminController.getDashboard);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, req, res, _next) => {
    logger.error('Unhandled error', { error: err.message, path: req.path });
    res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ───
const server = app.listen(config.port, () => {
    logger.info(`eSIM Bridge V1 started on port ${config.port}`);
});

server.timeout = 0;           // No request timeout (polling can take minutes)
server.keepAliveTimeout = 120000;

// ─── Graceful shutdown ───
function shutdown(sig) {
    logger.info(`${sig} — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 30000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (r) => logger.error('Unhandled rejection', { error: String(r) }));
process.on('uncaughtException', (e) => { logger.error('Uncaught exception', { error: e.message }); process.exit(1); });
