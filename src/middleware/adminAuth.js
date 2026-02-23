const crypto = require('crypto');

function adminAuth(req, res, next) {
    // 1. Prüfen, ob der Authorization-Header gesendet wurde
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
        // Fordert den Browser auf, das Login-Fenster zu zeigen
        res.setHeader('WWW-Authenticate', 'Basic realm="Secured Admin Dashboard"');
        return res.status(401).send('Zugriff verweigert: Bitte einloggen.');
    }

    // 2. Den Base64-codierten String aus dem Header extrahieren und decodieren
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    
    // 3. Benutzername und Passwort trennen (Format: "username:password")
    const [providedUser, providedPass] = credentials.split(':');

    // 4. Echte Zugangsdaten aus den Umgebungsvariablen laden (.env)
    const expectedUser = process.env.ADMIN_USERNAME || 'admin';
    const expectedPass = process.env.ADMIN_PASSWORD;

    if (!expectedPass) {
        console.error("SICHERHEITSWARNUNG: ADMIN_PASSWORD in der .env Datei fehlt!");
        return res.status(500).send('Server-Konfigurationsfehler.');
    }

    // 5. Timing-Safe Vergleich (Schutz vor Timing-Attacken)
    try {
        const safeProvidedUser = Buffer.from(providedUser);
        const safeExpectedUser = Buffer.from(expectedUser);
        const safeProvidedPass = Buffer.from(providedPass);
        const safeExpectedPass = Buffer.from(expectedPass);

        // Wir prüfen zuerst, ob die Längen übereinstimmen, um Fehler beim Puffer-Vergleich zu vermeiden
        const userMatch = safeProvidedUser.length === safeExpectedUser.length && 
                          crypto.timingSafeEqual(safeProvidedUser, safeExpectedUser);
                          
        const passMatch = safeProvidedPass.length === safeExpectedPass.length && 
                          crypto.timingSafeEqual(safeProvidedPass, safeExpectedPass);

        if (userMatch && passMatch) {
            // Login erfolgreich! Leite den Request weiter ans Dashboard
            return next();
        } else {
            // Falsches Passwort
            res.setHeader('WWW-Authenticate', 'Basic realm="Secured Admin Dashboard"');
            return res.status(401).send('Zugriff verweigert: Falsche Zugangsdaten.');
        }
    } catch (err) {
        // Fallback, falls beim Buffer-Vergleich etwas schiefgeht
        res.setHeader('WWW-Authenticate', 'Basic realm="Secured Admin Dashboard"');
        return res.status(401).send('Zugriff verweigert.');
    }
}

module.exports = adminAuth;
