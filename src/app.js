const express = require('express');
const config = require('./config');
const adminAuth = require('./middleware/adminAuth');
const verifySellauthSignature = require('./middleware/auth');
const adminController = require('./controllers/adminController');
const webhookHandler = require('./controllers/webhookHandler');

const app = express();

app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

app.get('/', (req, res) => {
    res.status(200).send('Bot is awake and ready.');
});

app.post('/webhook', verifySellauthSignature, webhookHandler.handleWebhook);

app.get('/admin', adminAuth, adminController.getDashboard);

const server = app.listen(config.port, () => {
    console.log(`eSIM Bridge Server läuft auf Port ${config.port}`);
});

server.timeout = 0;
