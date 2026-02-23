/**
 * Compact English templates for Sellauth.
 * All lines max ~30 chars to avoid word wrapping.
 */

const singleTemplates = [
    `✅ Your eSIM is ready!

%ESIM_LIST%

📲 Setup:
1. Open the link above.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,

    `🎉 Order complete!

%ESIM_LIST%

📲 Next steps:
1. Open the link above.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,

    `🌍 eSIM activated!

%ESIM_LIST%

📲 How to install:
1. Open the link above.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,

    `📬 eSIM delivered!

%ESIM_LIST%

📲 To activate:
1. Open the link above.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,

    `🚀 All set!

%ESIM_LIST%

📲 Quick setup:
1. Open the link above.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,

    `✨ eSIM is live!

%ESIM_LIST%

📲 Get started:
1. Open the link above.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,

    `📦 Delivery done!

%ESIM_LIST%

📲 Install now:
1. Open the link above.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,
];

const multiTemplates = [
    `✅ %COUNT% eSIMs ready!

%ESIM_LIST%

📲 Setup:
1. Open each link above.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,

    `🎉 %COUNT% eSIMs delivered!

%ESIM_LIST%

📲 Next steps:
1. Install one by one.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,

    `📦 %COUNT% eSIMs ready!

%ESIM_LIST%

📲 How to install:
1. Open each link above.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,

    `🚀 %COUNT% eSIMs – let's go!

%ESIM_LIST%

📲 Quick setup:
1. Open each link above.
2. Scan QR or tap Install.
3. Enable Data Roaming!`,
];

function formatEsimBlock(esim, index, total) {
    const lines = [];
    if (total > 1) lines.push(`── eSIM ${index + 1} of ${total} ──`);
    lines.push('ICCID:');
    lines.push(esim.iccid);
    if (esim.shortUrl) {
        lines.push('Install link:');
        lines.push(esim.shortUrl);
    }
    return lines.join('\n');
}

function buildDeliveryMessage(esims) {
    const blocks = esims.map((e, i) => formatEsimBlock(e, i, esims.length));
    const pool = esims.length === 1 ? singleTemplates : multiTemplates;
    const tpl = pool[Math.floor(Math.random() * pool.length)];
    return tpl
        .replace('%ESIM_LIST%', blocks.join('\n\n'))
        .replace(/%COUNT%/g, String(esims.length));
}

module.exports = { buildDeliveryMessage };
