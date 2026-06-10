// api/auth.js - Vercel Serverless Function
module.exports = (req, res) => {
  const CLIENT_ID   = process.env.GOOGLE_CLIENT_ID;
  const BASE_URL    = process.env.BASE_URL;
  const state       = req.query.state || 'login';

  const url = 'https://accounts.google.com/o/oauth2/v2/auth'
    + '?client_id='     + encodeURIComponent(CLIENT_ID)
    + '&redirect_uri='  + encodeURIComponent(BASE_URL + '/api/callback')
    + '&response_type=code'
    + '&scope='         + encodeURIComponent('email profile')
    + '&access_type=offline'
    + '&prompt=select_account'
    + '&state='         + encodeURIComponent(state);

  res.redirect(302, url);
};
