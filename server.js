const express = require('express');
const cors = require('cors');
const axios = require('axios');
const CryptoJS = require('crypto-js');
const admin = require('firebase-admin');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuration
const BASE_URL = 'https://openapi-sg.iotbing.com';
const ACCESS_ID = process.env.TUYA_ACCESS_ID || '7agqgv7h5kuhuen8tkhw';
const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET || '10fbcfc2cb644c3c838e7cc5b179b5b9';
// Default devices from history, can be overridden by env var
const DEVICE_IDS = (process.env.TUYA_DEVICE_IDS || 'a32ca52fe390525ac5gss3,a3e540a09673f26b29h48u').split(',').map(id => id.trim());

// Firebase Setup
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase initialized successfully');
    } catch (error) {
        console.error('Error initializing Firebase:', error.message);
    }
} else {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set. Firebase features disabled.');
}

// Helper to calculate signature
function calculateSign(method, path, body = '', t, accessToken = '', nonce = '') {
    const contentHash = CryptoJS.SHA256(body).toString(CryptoJS.enc.Hex);
    const stringToSign = [method, contentHash, '', path].join('\n');
    const signStr = ACCESS_ID + accessToken + t + nonce + stringToSign;
    return CryptoJS.HmacSHA256(signStr, ACCESS_SECRET).toString(CryptoJS.enc.Hex).toUpperCase();
}

// Helper to get headers
function getHeaders(path, t, accessToken = '') {
    const sign = calculateSign('GET', path, '', t, accessToken);
    const headers = {
        'client_id': ACCESS_ID,
        'sign': sign,
        't': t,
        'sign_method': 'HMAC-SHA256',
        'nonce': '',
        'mode': 'cors',
        'Content-Type': 'application/json'
    };
    if (accessToken) {
        headers['access_token'] = accessToken;
    }
    return headers;
}

// Flag to prevent overlapping fetches
let isFetching = false;
// Cache to store last known properties for each device
const deviceCache = {};

// Function to fetch and save data
async function fetchAndSaveData() {
    if (isFetching) {
        return; // Skip if previous job is still running
    }

    if (!admin.apps.length) {
        console.log('Skipping data fetch: Firebase not initialized');
        return;
    }

    isFetching = true;
    try {
        // 1. Get Token
        const t = Date.now().toString();
        const tokenPath = '/v1.0/token?grant_type=1';
        const tokenHeaders = getHeaders(tokenPath, t);

        const tokenResponse = await axios.get(`${BASE_URL}${tokenPath}`, { headers: tokenHeaders });

        if (!tokenResponse.data.success) {
            console.error('Failed to get access token:', tokenResponse.data);
            return;
        }

        const accessToken = tokenResponse.data.result.access_token;
        const db = admin.firestore();

        // 2. Loop through devices
        for (const deviceId of DEVICE_IDS) {
            if (!deviceId) continue;

            const t2 = Date.now().toString();
            const propPath = `/v2.0/cloud/thing/${deviceId}/shadow/properties`;
            const propHeaders = getHeaders(propPath, t2, accessToken);

            try {
                const propResponse = await axios.get(`${BASE_URL}${propPath}`, { headers: propHeaders });

                if (propResponse.data.success) {
                    const currentProperties = propResponse.data.result.properties;

                    // --- SMART POLLING LOGIC ---
                    // Check if data has changed compared to last cache
                    const lastProps = deviceCache[deviceId];
                    const hasChanged = JSON.stringify(lastProps) !== JSON.stringify(currentProperties);

                    if (hasChanged) {
                        // Data changed! Save to Firestore and update cache
                        await db.collection('meter_readings').add({
                            deviceId: deviceId,
                            timestamp: admin.firestore.FieldValue.serverTimestamp(),
                            properties: currentProperties,
                            // raw_response: propResponse.data // Disabled to save space
                        });

                        deviceCache[deviceId] = currentProperties; // Update cache
                        console.log(`[UPDATE] Saved new data for device ${deviceId}`);
                    } else {
                        // Data is same as before. Do nothing.
                        // console.log(`[SKIP] Data unchanged for device ${deviceId}`);
                    }
                } else {
                    console.error(`Failed to get properties for device ${deviceId}:`, propResponse.data);
                }
            } catch (devError) {
                console.error(`Error fetching device ${deviceId}:`, devError.message);
            }
        }
    } catch (error) {
        console.error('Error in fetchAndSaveData:', error.message);
    } finally {
        isFetching = false;
    }
}

// Schedule Cron Job (Runs every 5 seconds)
// '*/5 * * * * *' = Every 5 seconds
cron.schedule('*/5 * * * * *', fetchAndSaveData);
console.log('Cron job scheduled: Fetch data every 5 seconds (Smart Polling)');


// Proxy Endpoint: Get Token
app.get('/token', async (req, res) => {
    try {
        const t = Date.now().toString();
        const path = '/v1.0/token?grant_type=1';
        const headers = getHeaders(path, t);

        const response = await axios.get(`${BASE_URL}${path}`, { headers });
        res.json(response.data);
    } catch (error) {
        console.error('Token Error:', error.response?.data || error.message);
        res.status(500).json({ error: error.message, details: error.response?.data });
    }
});

// Proxy Endpoint: Get Device Properties
app.get('/device/:id/properties', async (req, res) => {
    try {
        const deviceId = req.params.id;
        const accessToken = req.headers['access_token'] || req.headers['x-access-token'];

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing access_token header' });
        }

        const t = Date.now().toString();
        const path = `/v2.0/cloud/thing/${deviceId}/shadow/properties`;
        const headers = getHeaders(path, t, accessToken);

        const response = await axios.get(`${BASE_URL}${path}`, { headers });
        res.json(response.data);
    } catch (error) {
        console.error('Device Properties Error:', error.response?.data || error.message);
        res.status(500).json({ error: error.message, details: error.response?.data });
    }
});

// Proxy Endpoint: Get Device State
app.get('/device/:id/state', async (req, res) => {
    try {
        const deviceId = req.params.id;
        const accessToken = req.headers['access_token'] || req.headers['x-access-token'];

        if (!accessToken) {
            return res.status(400).json({ error: 'Missing access_token header' });
        }

        const t = Date.now().toString();
        const path = `/v2.0/cloud/thing/${deviceId}/state`;
        const headers = getHeaders(path, t, accessToken);

        const response = await axios.get(`${BASE_URL}${path}`, { headers });
        res.json(response.data);
    } catch (error) {
        console.error('Device State Error:', error.response?.data || error.message);
        res.status(500).json({ error: error.message, details: error.response?.data });
    }
});

// Health check endpoint for Railway
app.get('/', (req, res) => {
    res.send('Tuya Proxy Server is running. Cron job active.');
});

app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
});
