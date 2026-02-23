const statsService = require('../services/statsService');
const path = require('path');

function getDashboard(req, res) {
    res.sendFile(path.join(__dirname, '../views/dashboard.html'));
}

function getHealth(req, res) {
    const stats = statsService.getStats();
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        stats,
    });
}

module.exports = { getDashboard, getHealth };
