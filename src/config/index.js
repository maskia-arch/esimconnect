require('dotenv').config();

const config = {
    port: parseInt(process.env.PORT, 10) || 3000,

    // Sellauth
    sellauthSecret: process.env.SELLAUTH_SECRET,
    sellauthApiKey: process.env.SELLAUTH_API_KEY || null,
    sellauthShopId: process.env.SELLAUTH_SHOP_ID || null,

    // eSIMAccess
    esimAccessCode: process.env.ESIM_ACCESS_CODE,

    // Admin
    admin: {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD
    },

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',

    // eSIM Polling
    esimPollInterval: parseInt(process.env.ESIM_POLL_INTERVAL, 10) || 10000,
    esimMaxPollAttempts: parseInt(process.env.ESIM_MAX_POLL_ATTEMPTS, 10) || 60,
};

// ─── Startup-Validierung ───
const required = [
    ['SELLAUTH_SECRET', config.sellauthSecret],
    ['ESIM_ACCESS_CODE', config.esimAccessCode],
    ['ADMIN_PASSWORD', config.admin.password],
];

const missing = required.filter(([, val]) => !val).map(([name]) => name);
if (missing.length > 0) {
    console.error(`FATAL: Fehlende Umgebungsvariablen: ${missing.join(', ')}`);
    process.exit(1);
}

module.exports = config;
