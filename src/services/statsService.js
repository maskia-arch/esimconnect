const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../data');
const statsPath = path.join(dataDir, 'stats.json');

function ensureDataFile() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(statsPath)) {
        fs.writeFileSync(statsPath, JSON.stringify({ totalOrders: 0 }));
    }
}

const statsService = {
    incrementOrders: () => {
        ensureDataFile();
        let stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        stats.totalOrders = (stats.totalOrders || 0) + 1;
        fs.writeFileSync(statsPath, JSON.stringify(stats));
    },
    getStats: () => {
        ensureDataFile();
        return JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    }
};

module.exports = statsService;
