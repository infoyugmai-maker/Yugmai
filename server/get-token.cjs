const { google } = require('googleapis');
const readline = require('readline');

// Replace these with your OAuth Client ID and Secret from Google Cloud Console
const CLIENT_ID = 'PASTE_YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = 'PASTE_YOUR_CLIENT_SECRET_HERE';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Or 'http://localhost:3000/oauth2callback' depending on app setup
// Wait, 'urn:ietf:wg:oauth:2.0:oob' is deprecated for Desktop clients.
// It's better to run a small local server.

const http = require('http');
const url = require('url');

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'http://localhost:3001');

const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'];

if (CLIENT_ID === 'PASTE_YOUR_CLIENT_ID_HERE') {
  console.log('\n❌ Please paste your CLIENT_ID and CLIENT_SECRET into get-token.js first!\n');
  process.exit(1);
}

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // Forces it to return a refresh token
});

console.log('\n======================================================');
console.log('1. Click this link to authorize YugmAI to use your 5TB Drive:');
console.log(authUrl);
console.log('======================================================\n');

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/?code=')) {
    const q = url.parse(req.url, true).query;
    if (q.code) {
      res.end('Authentication successful! You can close this window and check your terminal.');
      server.close();
      
      try {
        const { tokens } = await oauth2Client.getToken(q.code);
        console.log('\n✅ SUCCESS! Here is your Refresh Token. KEEP IT SECRET!\n');
        console.log('REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('\n👉 Add this to your server/.env file, along with your CLIENT_ID and CLIENT_SECRET.');
        process.exit(0);
      } catch (err) {
        console.error('Error getting tokens:', err);
      }
    }
  }
}).listen(3001, () => {
  console.log('Waiting for you to sign in on the browser...');
});
