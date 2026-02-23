const { createLogger, format, transports } = require('winston');
const config = require('../config');

const logger = createLogger({
    level: config.logLevel,
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.printf(({ timestamp, level, message, orderId, transactionId, ...meta }) => {
            let line = `${timestamp} [${level.toUpperCase()}]`;
            if (orderId) line += ` [order:${orderId}]`;
            if (transactionId) line += ` [tx:${transactionId}]`;
            line += ` ${message}`;
            const extraKeys = Object.keys(meta).filter(k => k !== 'stack');
            if (extraKeys.length > 0) {
                const extras = {};
                extraKeys.forEach(k => { extras[k] = meta[k]; });
                line += ` ${JSON.stringify(extras)}`;
            }
            if (meta.stack) line += `\n${meta.stack}`;
            return line;
        })
    ),
    transports: [
        new transports.Console(),
    ],
});

module.exports = logger;
