const esimService = require('../services/esimAccess');
const statsService = require('../services/statsService');

const templates = [
    "Hallo! Deine Bestellung ist einsatzbereit. Hier sind deine Daten:\n\n%ESIM_LIST%\n\nKurzanleitung:\n1. Kopiere die URL und öffne sie im Browser (dort findest du den QR-Code & Quick-Install für iOS/Android).\n2. WICHTIG: Bitte aktiviere nach der Installation das Datenroaming, sonst hast du kein Internet!",
    "Vielen Dank für deinen Einkauf! Deine eSIMs wurden erfolgreich erstellt:\n\n%ESIM_LIST%\n\nSo geht's:\n1. Kopiere die URL in deinen Browser für den Installations-QR-Code oder die 1-Klick-Einrichtung.\n2. WICHTIG: Datenroaming in den Einstellungen aktivieren!",
    "Hey! Deine Bestellung war erfolgreich. Hier ist deine Lieferung:\n\n%ESIM_LIST%\n\nBitte beachten:\n1. URL im Browser öffnen, um zur eSIM-Übersicht (QR-Code / Quick-Install) zu gelangen.\n2. WICHTIG: Aktiviere unbedingt das Datenroaming für diese eSIM.",
    "Großartig, deine Lieferung ist da! Hier findest du alle nötigen Details:\n\n%ESIM_LIST%\n\nInstallation:\n1. Öffne die URL im Browser, um den QR-Code oder iOS/Android Quick-Install zu sehen.\n2. WICHTIG: Ohne aktiviertes Datenroaming funktioniert die Verbindung nicht!",
    "Danke für dein Vertrauen! Deine eSIM-Daten sind ab sofort verfügbar:\n\n%ESIM_LIST%\n\nWichtig für die Einrichtung:\n1. Link im Browser aufrufen für die einfache Installation (QR / Quick-Install).\n2. WICHTIG: Datenroaming muss nach der Installation eingeschaltet werden.",
    "Hallo zurück! Deine Bestellung wurde soeben frisch generiert:\n\n%ESIM_LIST%\n\nErste Schritte:\n1. URL kopieren und im Browser öffnen (QR-Code & Quick-Install warten dort).\n2. WICHTIG: Bitte vergiss nicht, das Datenroaming zu aktivieren!",
    "Perfekt, alles hat geklappt! Deine eSIMs warten auf ihren Einsatz:\n\n%ESIM_LIST%\n\nAnleitung:\n1. Den Link im Browser öffnen, um die Installation (iOS/Android Quick-Install oder QR) zu starten.\n2. WICHTIG: Aktiviere danach sofort das Datenroaming.",
    "Deine eSIM-Bestellung ist abgeschlossen. Hier sind deine Zugangsdaten:\n\n%ESIM_LIST%\n\nZur Aktivierung:\n1. URL im Browser starten, um zur eSIM-Übersicht inkl. QR-Code zu gelangen.\n2. WICHTIG: Schalte das Datenroaming in deinen Einstellungen ein!",
    "Juhu, bereit für die Reise! Hier sind die Details zu deiner Bestellung:\n\n%ESIM_LIST%\n\nSo installierst du sie:\n1. Kopiere die URL und öffne sie im Browser für den Quick-Install.\n2. WICHTIG: Damit du surfen kannst, muss das Datenroaming aktiv sein.",
    "Herzlichen Glückwunsch zur neuen eSIM! Hier sind deine Aktivierungsdaten:\n\n%ESIM_LIST%\n\nHinweis zur Nutzung:\n1. Öffne den Link im Webbrowser für alle Installations-Optionen (QR / 1-Klick).\n2. WICHTIG: Aktiviere unbedingt das Datenroaming in deinem Gerät."
];

async function handleWebhook(req, res) {
    const packageCode = req.query.packageCode;
    const quantity = req.body?.item?.quantity || 1;

    if (!packageCode) {
        return res.status(400).send("Missing packageCode");
    }

    try {
        let esimBlocks = [];

        for (let i = 0; i < quantity; i++) {
            const activationData = await esimService.orderESim(packageCode);
            
            let block = `--- eSIM ${i + 1} ---\nICCID:\n${activationData.iccid}\n\neSIM URL:\n${activationData.shortUrl}`;
            esimBlocks.push(block);
            
            statsService.incrementOrders();
        }

        const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
        const formattedText = randomTemplate.replace('%ESIM_LIST%', esimBlocks.join('\n\n'));

        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(formattedText);

    } catch (error) {
        return res.status(500).send("Error provisioning eSIM");
    }
}

module.exports = { handleWebhook };
