/**
 * English delivery templates for Sellauth eSIM delivery.
 *
 * Each line is individually copyable in Sellauth's Deliverables view.
 * Labels on their own line, values on the next line.
 */

// ─── Single eSIM Templates ───
const singleTemplates = [
    `✅ Your eSIM is ready to go!

%ESIM_LIST%

📲 Quick Setup:
1. Open the installation link in your browser — you'll find the QR code & one-tap install for iOS/Android.
2. ⚠️ IMPORTANT: Enable Data Roaming in your device settings after installation, or you won't have internet!`,

    `🎉 Order complete! Here are your eSIM details:

%ESIM_LIST%

📲 How to install:
1. Tap the link or paste it into your browser — QR code & quick setup are waiting for you.
2. ⚠️ IMPORTANT: Turn on Data Roaming after installing the eSIM!`,

    `🌍 Your eSIM has been activated — happy travels!

%ESIM_LIST%

📲 Getting started:
1. Open the link in your browser → scan the QR code or use the quick install option.
2. ⚠️ IMPORTANT: Data Roaming must be enabled for the eSIM to connect!`,

    `📦 Delivery complete! Your eSIM credentials:

%ESIM_LIST%

📲 Next steps:
1. Open the installation link and follow the on-screen instructions (QR code / one-tap install).
2. ⚠️ IMPORTANT: Don't forget to enable Data Roaming in your settings!`,

    `🚀 All set! Here's your eSIM:

%ESIM_LIST%

📲 Installation guide:
1. Copy the link and open it in your browser to start the setup.
2. ⚠️ IMPORTANT: Make sure Data Roaming is turned on so you can get online!`,

    `✨ Your eSIM is live! Here are your access details:

%ESIM_LIST%

📲 Setup in seconds:
1. Open the installation link — choose QR code or direct install for your device.
2. ⚠️ IMPORTANT: Enable Data Roaming after installation to activate your connection!`,

    `📬 Your order has been delivered! eSIM details below:

%ESIM_LIST%

📲 To activate:
1. Open the link in any browser to access your QR code or quick install page.
2. ⚠️ IMPORTANT: You must enable Data Roaming on your device for the eSIM to work!`,
];

// ─── Multi eSIM Templates ───
const multiTemplates = [
    `✅ Your %COUNT% eSIMs are ready to go!

%ESIM_LIST%

📲 Quick Setup:
1. Open each installation link in your browser — each has its own QR code & quick install.
2. ⚠️ IMPORTANT: Enable Data Roaming for each eSIM after installation!`,

    `🎉 Order complete! Here are your %COUNT% eSIMs:

%ESIM_LIST%

📲 How to install:
1. Install each eSIM one by one using the links above.
2. ⚠️ IMPORTANT: Turn on Data Roaming separately for each eSIM!`,

    `📦 Delivery complete — %COUNT% eSIMs ready for you!

%ESIM_LIST%

📲 Getting started:
1. Open each link in your browser and follow the setup instructions.
2. ⚠️ IMPORTANT: Data Roaming must be enabled for each eSIM to connect!`,

    `🚀 All set! Your %COUNT% eSIMs are below:

%ESIM_LIST%

📲 Installation guide:
1. Set up each eSIM individually via the installation links.
2. ⚠️ IMPORTANT: Don't forget to enable Data Roaming for every eSIM!`,
];

/**
 * Formats a single eSIM as a copyable block.
 *
 * Output (each line individually copyable in Sellauth):
 *
 *   ━━━ eSIM 1 of 3 ━━━         ← only for multi
 *   ICCID:
 *   89972502300029xxxx
 *   eSIM Installation:
 *   https://p.qrsim.net/xxxxx
 */
function formatEsimBlock(esim, index, total) {
    const lines = [];

    if (total > 1) {
        lines.push(`━━━ eSIM ${index + 1} of ${total} ━━━`);
    }

    lines.push('ICCID:');
    lines.push(esim.iccid);

    if (esim.shortUrl) {
        lines.push('eSIM Installation:');
        lines.push(esim.shortUrl);
    }

    return lines.join('\n');
}

/**
 * Builds the full delivery message.
 */
function buildDeliveryMessage(esims) {
    const blocks = esims.map((e, i) => formatEsimBlock(e, i, esims.length));

    const pool = esims.length === 1 ? singleTemplates : multiTemplates;
    const template = pool[Math.floor(Math.random() * pool.length)];

    return template
        .replace('%ESIM_LIST%', blocks.join('\n\n'))
        .replace(/%COUNT%/g, String(esims.length));
}

module.exports = { buildDeliveryMessage };
