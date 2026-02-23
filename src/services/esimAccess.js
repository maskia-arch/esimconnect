const axios = require('axios');
const crypto = require('crypto');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function orderESim(packageCode) {
    const transactionId = `SA_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const headers = {
        'RT-AccessCode': process.env.ESIM_ACCESS_CODE,
        'Content-Type': 'application/json'
    };

    try {
        await axios.post('https://api.esimaccess.com/v1/open/package/order', {
            packageCode: packageCode,
            count: 1,
            transactionId: transactionId
        }, { headers });

        let attempts = 0;
        const maxAttempts = 100; 

        while (attempts < maxAttempts) {
            await sleep(15000);

            const queryRes = await axios.post('https://api.esimaccess.com/v1/open/esim/query', {
                transactionId: transactionId
            }, { headers });

            const queryData = queryRes.data?.obj || queryRes.data;
            const esimList = queryData?.esimList || queryData?.cards || (Array.isArray(queryData) ? queryData : [queryData]);

            if (esimList && esimList.length > 0 && esimList[0].iccid) {
                const esim = esimList[0];
                return {
                    iccid: esim.iccid,
                    shortUrl: esim.shortUrl || esim.qrcodeUrl || 'Kein Link verfügbar'
                };
            }

            attempts++;
        }

        throw new Error("Timeout beim Warten auf die eSIM (Generierung dauerte zu lange).");
    } catch (error) {
        throw new Error(error.response?.data?.message || error.message);
    }
}

module.exports = { orderESim };
