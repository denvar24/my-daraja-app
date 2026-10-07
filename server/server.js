const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Serve static frontend files (index.html, style.css, script.js) from the 'public' folder
app.use(express.static(path.join(__dirname, '../public')));

// Environment variables
const CONSUMER_KEY = process.env.CONSUMER_KEY;
const CONSUMER_SECRET = process.env.CONSUMER_SECRET;
const SHORTCODE = process.env.BUSINESS_SHORTCODE || '174379';
const PASSKEY = process.env.PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';

// Dynamic Callback URL for Render or Local Testing
const HOST_URL = process.env.RENDER_EXTERNAL_URL || 'https://my-daraja-app.onrender.com';
const CALLBACK_URL = `${HOST_URL}/api/callback`;

// Middleware to generate Daraja OAuth Token
const getOAuthToken = async (req, res, next) => {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  try {
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}` } }
    );
    req.token = response.data.access_token;
    next();
  } catch (error) {
    console.error('OAuth Token Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'OAuth token generation failed' });
  }
};

// Route 1: Serve frontend index.html on root '/'
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Route 2: Initiate STK Push Prompt
app.post('/api/stkpush', getOAuthToken, async (req, res) => {
  const { phone, amount } = req.body;

  if (!phone || !amount) {
    return res.status(400).json({ error: 'Phone number and amount are required' });
  }

  // Format phone number to 254XXXXXXXXX format
  let formattedPhone = phone.trim();
  if (formattedPhone.startsWith('0')) {
    formattedPhone = `254${formattedPhone.slice(1)}`;
  } else if (formattedPhone.startsWith('+254')) {
    formattedPhone = formattedPhone.slice(1);
  }

  // Generate Timestamp: YYYYMMDDHHMMSS
  const date = new Date();
  const timestamp = date.getFullYear() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0') +
    String(date.getHours()).padStart(2, '0') +
    String(date.getMinutes()).padStart(2, '0') +
    String(date.getSeconds()).padStart(2, '0');

  // Password string: Base64(Shortcode + Passkey + Timestamp)
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');

  const stkData = {
    BusinessShortCode: SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: formattedPhone,
    PartyB: SHORTCODE,
    PhoneNumber: formattedPhone,
    CallBackURL: CALLBACK_URL,
    AccountReference: 'Fundraiser Donation',
    TransactionDesc: 'Donation to Fundraiser Campaign'
  };

  try {
    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkData,
      { headers: { Authorization: `Bearer ${req.token}` } }
    );
    res.status(200).json({ message: 'STK Push sent successfully', data: response.data });
  } catch (error) {
    console.error('STK Push Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.response ? error.response.data : error.message });
  }
});

// Route 3: M-PESA Callback endpoint
app.post('/api/callback', (req, res) => {
  console.log('Payment Callback Received:', JSON.stringify(req.body, null, 2));
  res.status(200).send('OK');
});

// Start express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));