// api/callback.js - Vercel Serverless Function
const https = require('https');

module.exports = async (req, res) => {
  const CLIENT_ID       = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET   = process.env.GOOGLE_CLIENT_SECRET;
  const BASE_URL        = process.env.BASE_URL;
  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

  const code  = req.query.code  || '';
  const state = req.query.state || '';
  const error = req.query.error || '';

  if (error) return res.redirect(302, BASE_URL + '/success.html?status=cancelled');
  if (!code)  return res.redirect(302, BASE_URL + '/success.html?status=error&msg=no_code');

  const stateDecoded = decodeURIComponent(state);
  const parts        = stateDecoded.split('|');
  const type         = parts[0];
  const REDIRECT_URI = BASE_URL + '/api/callback';

  // LOGIN FLOW
  if (type === 'login') {
    try {
      const token    = await exchangeCode(code, REDIRECT_URI, CLIENT_ID, CLIENT_SECRET);
      if (!token.access_token) throw new Error(token.error || 'No access token');
      const userInfo = await getUserInfo(token.access_token);
      const email    = userInfo.email || '';
      const name     = userInfo.name  || email;
      return res.redirect(302, BASE_URL + '/index.html'
        + '?email=' + encodeURIComponent(email)
        + '&name='  + encodeURIComponent(name)
        + '&step=form'
      );
    } catch(e) {
      return res.redirect(302, BASE_URL + '/success.html?status=error&msg=' + encodeURIComponent(e.message));
    }
  }

  // CALENDAR FLOW
  if (type === 'calendar') {
    const email      = parts[1] || '';
    const nama       = parts[2] || '';
    const userId     = parts[3] || '';
    const noHp       = parts[4] || '';
    const matchesRaw = parts[5] || '[]';

    let matches = [];
    try { matches = JSON.parse(decodeURIComponent(matchesRaw)); } catch(e) { matches = []; }

    try {
      const token = await exchangeCode(code, REDIRECT_URI, CLIENT_ID, CLIENT_SECRET);
      if (!token.access_token) throw new Error(token.error || 'No access token');

      await callAppsScript(APPS_SCRIPT_URL, {
        action: 'save', email, nama, userId, noHp,
        accessToken:  token.access_token,
        refreshToken: token.refresh_token || '',
        matches:      JSON.stringify(matches)
      });

      return res.redirect(302, BASE_URL + '/success.html?status=success&name=' + encodeURIComponent(nama));
    } catch(e) {
      return res.redirect(302, BASE_URL + '/success.html?status=error&msg=' + encodeURIComponent(e.message));
    }
  }

  return res.redirect(302, BASE_URL + '/success.html?status=error&msg=invalid_state');
};

async function exchangeCode(code, redirectUri, clientId, clientSecret) {
  const body = new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirectUri, grant_type: 'authorization_code'
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com', path: '/oauth2/v2/userinfo',
      headers: { 'Authorization': 'Bearer ' + accessToken }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function callAppsScript(appsScriptUrl, params) {
  const url = new URL(appsScriptUrl);
  const qs  = new URLSearchParams(params).toString();

  const doRequest = (hostname, path, count) => new Promise((resolve) => {
    if (count > 6) return resolve({ success: true });
    const req = https.request({
      hostname, path, method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    }, r => {
      if ([301,302,307,308].includes(r.statusCode) && r.headers.location) {
        try {
          const loc = new URL(r.headers.location);
          resolve(doRequest(loc.hostname, loc.pathname + (loc.search || ''), count + 1));
        } catch(e) { resolve({ success: true }); }
        r.resume(); return;
      }
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ success: true }); } });
    });
    req.on('error', () => resolve({ success: true }));
    req.end();
  });

  return doRequest(url.hostname, url.pathname + '?' + qs, 0);
}
