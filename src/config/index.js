require('dotenv').config();

const config = {
    port: parseInt(process.env.PORT, 10) || 3000,
    sellauthSecret: process.env.SELLAUTH_SECRET,
    esimAccessCode: process.env.ESIM_ACCESS_CODE,
    admin: {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD,
    },
    logLevel: process.env.LOG_LEVEL || 'info',
};

const missing = [
    ['SELLAUTH_SECRET', config.sellauthSecret],
    ['ESIM_ACCESS_CODE', config.esimAccessCode],
    ['ADMIN_PASSWORD', config.admin.password],
].filter(([, v]) => !v).map(([n]) => n);

if (missing.length) {
    console.error(`FATAL: Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
}

module.exports = config;
