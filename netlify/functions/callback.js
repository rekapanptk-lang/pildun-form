// netlify/functions/callback.js
// Handle OAuth callback dari Google (login & calendar)

const https = require('https');

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SHEET_ID      = process.env.SHEET_ID;
const SHEET_API_KEY = process.env.SHEET_API_KEY; // Service account atau Apps Script Web App URL
const BASE_URL      = process.env.BASE_URL;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const code   = params.code  || '';
  const state  = params.state || '';
  const error  = params.error || '';

  if (error) {
    return redirect(BASE_URL + '/success.html?status=cancelled');
  }

  if (!code) {
    return redirect(BASE_URL + '/success.html?status=error&msg=no_code');
  }

  const stateDecoded = decodeURIComponent(state);
  const parts        = stateDecoded.split('|');
  const type         = parts[0]; // 'login' atau 'calendar'

  const REDIRECT_URI = BASE_URL + '/.netlify/functions/callback';

  // ── LOGIN FLOW ──
  if (type === 'login') {
    try {
      const token    = await exchangeCode(code, REDIRECT_URI);
      if (!token.access_token) throw new Error(token.error || 'No access token');

      const userInfo = await getUserInfo(token.access_token);
      const email    = userInfo.email || '';
      const name     = userInfo.name  || email;

      // Redirect ke form dengan data user
      return redirect(BASE_URL + '/index.html'
        + '?email=' + encodeURIComponent(email)
        + '&name='  + encodeURIComponent(name)
        + '&step=form'
      );
    } catch(e) {
      return redirect(BASE_URL + '/success.html?status=error&msg=' + encodeURIComponent(e.message));
    }
  }

  // ── CALENDAR FLOW ──
  if (type === 'calendar') {
    const email        = parts[1] || '';
    const nama         = parts[2] || '';
    const pertandingan = parts[3] || '';
    const timA         = parts[4] || '';
    const timB         = parts[5] || '';
    const skorA        = parts[6] || '0';
    const skorB        = parts[7] || '0';
    const noHp         = parts[8] || '';

    try {
      const token = await exchangeCode(code, REDIRECT_URI);
      if (!token.access_token) throw new Error(token.error || 'No access token');

      // Simpan ke Google Sheet via Apps Script Web App
      const saveData = {
        action:        'save',
        email,
        nama,
        noHp,
        pertandingan,
        timA,
        timB,
        skorA,
        skorB,
        accessToken:   token.access_token,
        refreshToken:  token.refresh_token || ''
      };

      await postToAppsScript(saveData);

      return redirect(BASE_URL + '/success.html?status=success&name=' + encodeURIComponent(nama));
    } catch(e) {
      return redirect(BASE_URL + '/success.html?status=error&msg=' + encodeURIComponent(e.message));
    }
  }

  return redirect(BASE_URL + '/success.html?status=error&msg=invalid_state');
};

// ── HELPERS ──

function redirect(url) {
  return { statusCode: 302, headers: { Location: url } };
}

async function exchangeCode(code, redirectUri) {
  const body = new URLSearchParams({
    code,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  redirectUri,
    grant_type:    'authorization_code'
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path:     '/oauth2/v2/userinfo',
      headers:  { 'Authorization': 'Bearer ' + accessToken }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function postToAppsScript(data) {
  const url    = new URL(APPS_SCRIPT_URL);
  const params = new URLSearchParams(data).toString();
  const path   = url.pathname + '?' + params;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path:     path,
      method:   'GET'
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.end();
  });
}
