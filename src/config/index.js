require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    sellauthSecret: process.env.SELLAUTH_SECRET,
    esimAccessCode: process.env.ESIM_ACCESS_CODE,
    admin: {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD
    }
};

module.exports = config;
