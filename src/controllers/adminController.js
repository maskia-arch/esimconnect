const fs = require('fs');
const path = require('path');
const statsService = require('../services/statsService');
const logger = require('../services/logger');

/**
 * Formatiert Sekunden in lesbares Uptime-Format.
 */
function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);

    return parts.join(' ');
}

/**
 * Rendert das Admin-Dashboard.
 */
const getDashboard = (req, res) => {
    const stats = statsService.getStats();
    const uptimeStr = formatUptime(process.uptime());
    const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    const htmlPath = path.join(__dirname, '../views/dashboard.html');

    try {
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace('{{TOTAL_ORDERS}}', stats.totalOrders || 0);
        html = html.replace('{{TOTAL_ESIMS}}', stats.totalEsims || 0);
        html = html.replace('{{ERRORS}}', stats.errors || 0);
        html = html.replace('{{UPTIME}}', uptimeStr);
        html = html.replace('{{MEMORY}}', memUsage);
        html = html.replace('{{LAST_ORDER}}', stats.lastOrderAt
            ? new Date(stats.lastOrderAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
            : 'Noch keine');
        html = html.replace('{{VERSION}}', 'V1.0');

        res.send(html);
    } catch (error) {
        logger.error('Dashboard-Rendering fehlgeschlagen', { error: error.message });
        res.status(500).send('Dashboard Error');
    }
};

/**
 * Health-Check Endpoint (JSON).
 */
const getHealth = (req, res) => {
    const stats = statsService.getStats();
    res.json({
        status: 'ok',
        version: '1.0.0',
        uptime: Math.floor(process.uptime()),
        stats: {
            totalOrders: stats.totalOrders,
            totalEsims: stats.totalEsims,
            errors: stats.errors,
            lastOrderAt: stats.lastOrderAt,
        },
    });
};

module.exports = { getDashboard, getHealth };
