// netlify/functions/auth.js
// Handle Google OAuth login (scope: email + profile)

exports.handler = async (event) => {
  const CLIENT_ID   = process.env.GOOGLE_CLIENT_ID;
  const REDIRECT_URI = process.env.BASE_URL + '/.netlify/functions/callback';

  const state = event.queryStringParameters?.state || 'login';

  const url = 'https://accounts.google.com/o/oauth2/v2/auth'
    + '?client_id='     + encodeURIComponent(CLIENT_ID)
    + '&redirect_uri='  + encodeURIComponent(REDIRECT_URI)
    + '&response_type=code'
    + '&scope='         + encodeURIComponent('email profile')
    + '&access_type=offline'
    + '&prompt=select_account'
    + '&state='         + encodeURIComponent(state);

  return {
    statusCode: 302,
    headers: { Location: url }
  };
};
