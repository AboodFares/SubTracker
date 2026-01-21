// config/oAuth.js
const { google } = require("googleapis");

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,     // from your .env
  process.env.GOOGLE_CLIENT_SECRET, // from your .env
  process.env.GOOGLE_REDIRECT_URI   // from your .env
);

module.exports = { oauth2Client };

