const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());

// Configure body-parser to handle raw binary data for image uploads
// Increase limit to handle large images (e.g., 50MB)
app.use(bodyParser.raw({ type: ['image/*', 'application/octet-stream'], limit: '50mb' }));
app.use(bodyParser.json());

// Tinify API endpoint
const TINIFY_API_URL = 'https://api.tinify.com/shrink';

// Validate API Key
if (!process.env.TINIFY_API_KEY) {
    console.warn('⚠️  Warning: TINIFY_API_KEY is not set in .env file.');
}

// Proxy endpoint for compression
app.post('/api/compress', async (req, res) => {
    try {
        const apiKey = process.env.TINIFY_API_KEY;
        
        if (!apiKey) {
            return res.status(500).json({ 
                error: 'Server Configuration Error', 
                message: 'Tinify API Key is not configured on the server.' 
            });
        }

        // Check if body contains data
        if (!req.body || req.body.length === 0) {
            return res.status(400).json({ 
                error: 'Bad Request', 
                message: 'No image data provided in the request body.' 
            });
        }

        console.log(`📦 Received compression request. Size: ${req.body.length} bytes`);

        // Forward request to Tinify
        const response = await axios.post(TINIFY_API_URL, req.body, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
                'Content-Type': req.get('Content-Type') || 'application/octet-stream'
            },
            validateStatus: status => status < 500 // Resolve even if 4xx to pass Tinify errors to client
        });

        // If Tinify returns error (e.g., 401, 415), forward it
        if (response.status >= 400) {
            console.error('❌ Tinify API Error:', response.status, response.data);
            return res.status(response.status).json(response.data);
        }

        console.log('✅ Compression successful:', response.data);
        
        // Return Tinify's response directly
        // The response typically contains input info and output info (url, size, type)
        res.json(response.data);

    } catch (error) {
        console.error('❌ Proxy Error:', error.message);
        if (error.response) {
            console.error('   Tinify Response:', error.response.data);
        }
        res.status(500).json({ 
            error: 'Proxy Error', 
            message: 'Failed to communicate with Tinify API.',
            details: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
    console.log(`📝 Endpoint: POST http://localhost:${PORT}/api/compress`);
});
