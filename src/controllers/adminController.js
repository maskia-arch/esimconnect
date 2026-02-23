const fs = require('fs');
const path = require('path');
const statsService = require('../services/statsService');

const getDashboard = (req, res) => {
    const stats = statsService.getStats();
    const uptimeSeconds = process.uptime();
    const uptimeStr = new Date(uptimeSeconds * 1000).toISOString().substring(11, 19);

    const htmlPath = path.join(__dirname, '../views/dashboard.html');

    try {
        let html = fs.readFileSync(htmlPath, 'utf8');
        html = html.replace('{{TOTAL_ORDERS}}', stats.totalOrders);
        html = html.replace('{{UPTIME}}', uptimeStr);
        
        res.send(html);
    } catch (error) {
        res.status(500).send('Dashboard Error');
    }
};

module.exports = { getDashboard };
