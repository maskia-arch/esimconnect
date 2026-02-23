/**
 * Nachrichten-Templates für die eSIM-Lieferung.
 *
 * WICHTIG: Sellauth zeigt die Antwort im "Deliverables"-Feld an.
 * Der Kunde hat dort "Kopieren Deliverables" und "Herunterladen Deliverables".
 * Deshalb: ICCID und URL OHNE Labels ausgeben, jeweils auf eigener Zeile,
 * damit beim Kopieren nur die reinen Daten im Clipboard landen.
 *
 * Platzhalter:
 *   %ESIM_LIST% — wird durch die formatierten eSIM-Daten ersetzt
 */
const templates = [
    `Hallo! Deine Bestellung ist einsatzbereit. Hier sind deine Daten:

%ESIM_LIST%

Kurzanleitung:
1. Kopiere die URL und öffne sie im Browser (dort findest du den QR-Code & Quick-Install für iOS/Android).
2. WICHTIG: Bitte aktiviere nach der Installation das Datenroaming, sonst hast du kein Internet!`,

    `Vielen Dank für deinen Einkauf! Deine eSIMs wurden erfolgreich erstellt:

%ESIM_LIST%

So geht's:
1. Kopiere die URL in deinen Browser für den Installations-QR-Code oder die 1-Klick-Einrichtung.
2. WICHTIG: Datenroaming in den Einstellungen aktivieren!`,

    `Hey! Deine Bestellung war erfolgreich. Hier ist deine Lieferung:

%ESIM_LIST%

Bitte beachten:
1. URL im Browser öffnen, um zur eSIM-Übersicht (QR-Code / Quick-Install) zu gelangen.
2. WICHTIG: Aktiviere unbedingt das Datenroaming für diese eSIM.`,

    `Großartig, deine Lieferung ist da! Hier findest du alle nötigen Details:

%ESIM_LIST%

Installation:
1. Öffne die URL im Browser, um den QR-Code oder iOS/Android Quick-Install zu sehen.
2. WICHTIG: Ohne aktiviertes Datenroaming funktioniert die Verbindung nicht!`,

    `Danke für dein Vertrauen! Deine eSIM-Daten sind ab sofort verfügbar:

%ESIM_LIST%

Wichtig für die Einrichtung:
1. Link im Browser aufrufen für die einfache Installation (QR / Quick-Install).
2. WICHTIG: Datenroaming muss nach der Installation eingeschaltet werden.`,

    `Perfekt, alles hat geklappt! Deine eSIMs warten auf ihren Einsatz:

%ESIM_LIST%

Anleitung:
1. Den Link im Browser öffnen, um die Installation (iOS/Android Quick-Install oder QR) zu starten.
2. WICHTIG: Aktiviere danach sofort das Datenroaming.`,

    `Deine eSIM-Bestellung ist abgeschlossen. Hier sind deine Zugangsdaten:

%ESIM_LIST%

Zur Aktivierung:
1. URL im Browser starten, um zur eSIM-Übersicht inkl. QR-Code zu gelangen.
2. WICHTIG: Schalte das Datenroaming in deinen Einstellungen ein!`,

    `Juhu, bereit für die Reise! Hier sind die Details zu deiner Bestellung:

%ESIM_LIST%

So installierst du sie:
1. Kopiere die URL und öffne sie im Browser für den Quick-Install.
2. WICHTIG: Damit du surfen kannst, muss das Datenroaming aktiv sein.`,

    `Herzlichen Glückwunsch zur neuen eSIM! Hier sind deine Aktivierungsdaten:

%ESIM_LIST%

Hinweis zur Nutzung:
1. Öffne den Link im Webbrowser für alle Installations-Optionen (QR / 1-Klick).
2. WICHTIG: Aktiviere unbedingt das Datenroaming in deinem Gerät.`,

    `Hallo zurück! Deine Bestellung wurde soeben frisch generiert:

%ESIM_LIST%

Erste Schritte:
1. URL kopieren und im Browser öffnen (QR-Code & Quick-Install warten dort).
2. WICHTIG: Bitte vergiss nicht, das Datenroaming zu aktivieren!`,
];

/**
 * Formatiert eine einzelne eSIM als kopierbaren Block.
 *
 * Format (OHNE Labels, damit "Kopieren Deliverables" saubere Daten liefert):
 *
 *   --- eSIM 1 ---        (nur bei quantity > 1)
 *   89852350924060003915
 *   https://esimaccess.com/e/xxxxx
 *
 * Jede Zeile ist einzeln kopierbar.
 */
function formatEsimBlock(esim, index, total) {
    const lines = [];

    if (total > 1) {
        lines.push(`--- eSIM ${index + 1} ---`);
    }

    lines.push(esim.iccid);

    if (esim.shortUrl) {
        lines.push(esim.shortUrl);
    }

    return lines.join('\n');
}

/**
 * Erstellt die vollständige Liefernachricht.
 *
 * @param {Array<{iccid: string, shortUrl: string|null}>} esims
 * @returns {string} Formatierte Nachricht für den Kunden
 */
function buildDeliveryMessage(esims) {
    const blocks = esims.map((esim, i) => formatEsimBlock(esim, i, esims.length));
    const esimListText = blocks.join('\n\n');

    const template = templates[Math.floor(Math.random() * templates.length)];
    return template.replace('%ESIM_LIST%', esimListText);
}

module.exports = { buildDeliveryMessage };
