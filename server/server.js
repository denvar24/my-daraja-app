const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Environment variables (store safely in .env)
const CONSUMER_KEY = process.env.CONSUMER_KEY;
const CONSUMER_SECRET = process.env.CONSUMER_SECRET;
const SHORTCODE = '174379';
const PASSKEY = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'; 
const CALLBACK_URL = 'https://your-domain.com/api/callback'; // Must be HTTPS

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
    res.status(500).json({ error: 'OAuth token generation failed' });
  }
};

// Route: Initiate STK Push Prompt
app.post('/api/stkpush', getOAuthToken, async (req, res) => {
  const { phone, amount } = req.body;

  // Format phone number to 254XXXXXXXXX
  const formattedPhone = phone.startsWith('0') ? `254${phone.slice(1)}` : phone;

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
    res.status(500).json({ error: error.response ? error.response.data : error.message });
  }
});

// Callback route to catch response from Safaricom
app.post('/api/callback', (req, res) => {
  console.log('Payment Callback Received:', req.body.Body.stkCallback);
  res.status(200).send('OK');
});

app.listen(3000, () => console.log('Server running on port 3000'));