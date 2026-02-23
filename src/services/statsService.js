const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../data');
const statsPath = path.join(dataDir, 'stats.json');

// ─── Pure in-memory stats, async flush to disk ───
let stats = { totalOrders: 0, totalEsims: 0, lastOrderAt: null, errors: 0 };
let dirty = false;

// Load from disk on startup
try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (fs.existsSync(statsPath)) {
        stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    }
} catch (_) { /* start fresh */ }

// Flush to disk every 10s if changed — NEVER blocks request handling
setInterval(() => {
    if (!dirty) return;
    dirty = false;
    fs.writeFile(statsPath, JSON.stringify(stats, null, 2), () => {});
}, 10000);

// Also flush on shutdown
process.on('beforeExit', () => {
    if (dirty) fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
});

module.exports = {
    recordOrder(esimCount = 1) {
        stats.totalOrders++;
        stats.totalEsims += esimCount;
        stats.lastOrderAt = new Date().toISOString();
        dirty = true;
    },
    recordError() {
        stats.errors++;
        dirty = true;
    },
    getStats() {
        return { ...stats };
    },
};
