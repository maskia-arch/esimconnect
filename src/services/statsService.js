const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const dataDir = path.join(__dirname, '../../data');
const statsPath = path.join(dataDir, 'stats.json');

// ─── In-Memory Cache ───
let statsCache = null;

/**
 * Erstellt die Datendatei, falls sie nicht existiert.
 */
function ensureDataFile() {
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (!fs.existsSync(statsPath)) {
            const initial = {
                totalOrders: 0,
                totalEsims: 0,
                lastOrderAt: null,
                errors: 0,
            };
            fs.writeFileSync(statsPath, JSON.stringify(initial, null, 2));
            statsCache = initial;
        }
    } catch (err) {
        logger.error('Fehler beim Erstellen der Stats-Datei', { error: err.message });
    }
}

/**
 * Lädt die Stats aus der Datei (oder Cache).
 */
function loadStats() {
    if (statsCache) return statsCache;

    ensureDataFile();
    try {
        const raw = fs.readFileSync(statsPath, 'utf8');
        statsCache = JSON.parse(raw);
        return statsCache;
    } catch (err) {
        logger.error('Fehler beim Lesen der Stats-Datei', { error: err.message });
        return { totalOrders: 0, totalEsims: 0, lastOrderAt: null, errors: 0 };
    }
}

/**
 * Speichert die Stats in die Datei und aktualisiert den Cache.
 */
function saveStats(stats) {
    try {
        statsCache = stats;
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    } catch (err) {
        logger.error('Fehler beim Speichern der Stats-Datei', { error: err.message });
    }
}

const statsService = {
    /**
     * Registriert eine erfolgreiche Bestellung.
     * @param {number} esimCount - Anzahl der gelieferten eSIMs
     */
    recordOrder(esimCount = 1) {
        const stats = loadStats();
        stats.totalOrders = (stats.totalOrders || 0) + 1;
        stats.totalEsims = (stats.totalEsims || 0) + esimCount;
        stats.lastOrderAt = new Date().toISOString();
        saveStats(stats);
    },

    /**
     * Registriert einen Fehler.
     */
    recordError() {
        const stats = loadStats();
        stats.errors = (stats.errors || 0) + 1;
        saveStats(stats);
    },

    /**
     * Gibt alle Stats zurück.
     */
    getStats() {
        return loadStats();
    },
};

// Initial laden
ensureDataFile();

module.exports = statsService;
