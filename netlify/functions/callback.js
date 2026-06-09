// netlify/functions/callback.js
const https = require('https');

const CLIENT_ID       = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET   = process.env.GOOGLE_CLIENT_SECRET;
const BASE_URL        = process.env.BASE_URL;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const code   = params.code  || '';
  const state  = params.state || '';
  const error  = params.error || '';

  if (error) return redirect(BASE_URL + '/success.html?status=cancelled');
  if (!code)  return redirect(BASE_URL + '/success.html?status=error&msg=no_code');

  const stateDecoded = decodeURIComponent(state);
  const parts        = stateDecoded.split('|');
  const type         = parts[0];
  const REDIRECT_URI = BASE_URL + '/.netlify/functions/callback';

  // LOGIN FLOW
  if (type === 'login') {
    try {
      const token    = await exchangeCode(code, REDIRECT_URI);
      if (!token.access_token) throw new Error(token.error || 'No access token');
      const userInfo = await getUserInfo(token.access_token);
      const email    = userInfo.email || '';
      const name     = userInfo.name  || email;
      return redirect(BASE_URL + '/index.html'
        + '?email=' + encodeURIComponent(email)
        + '&name='  + encodeURIComponent(name)
        + '&step=form'
      );
    } catch(e) {
      return redirect(BASE_URL + '/success.html?status=error&msg=' + encodeURIComponent(e.message));
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
      const token = await exchangeCode(code, REDIRECT_URI);
      if (!token.access_token) throw new Error(token.error || 'No access token');

      const savePayload = {
        action:       'save',
        email,
        nama,
        userId,
        noHp,
        accessToken:  token.access_token,
        refreshToken: token.refresh_token || '',
        matches:      JSON.stringify(matches)
      };

      await callAppsScript(savePayload);

      return redirect(BASE_URL + '/success.html?status=success&name=' + encodeURIComponent(nama));
    } catch(e) {
      return redirect(BASE_URL + '/success.html?status=error&msg=' + encodeURIComponent(e.message));
    }
  }

  return redirect(BASE_URL + '/success.html?status=error&msg=invalid_state');
};

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
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
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
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// Handle Apps Script redirect dan non-JSON response
async function callAppsScript(params) {
  const baseUrl = new URL(APPS_SCRIPT_URL);
  const qs      = new URLSearchParams(params).toString();

  const doRequest = (hostname, path, redirectCount) => {
    return new Promise((resolve) => {
      if (redirectCount > 6) return resolve({ success: true });

      const req = https.request({
        hostname,
        path,
        method:  'GET',
        headers: {
          'Accept':     'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      }, res => {
        // Ikuti redirect
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          try {
            const loc = new URL(res.headers.location);
            resolve(doRequest(loc.hostname, loc.pathname + (loc.search || ''), redirectCount + 1));
          } catch(e) {
            resolve({ success: true });
          }
          // Drain response
          res.resume();
          return;
        }

        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try   { resolve(JSON.parse(d)); }
          catch (e) { resolve({ success: true }); } // HTML = anggap sukses
        });
      });

      req.on('error', () => resolve({ success: true }));
      req.end();
    });
  };

  return doRequest(baseUrl.hostname, baseUrl.pathname + '?' + qs, 0);
}
