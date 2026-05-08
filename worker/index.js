const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(req.url);

    try {
      // POST /exchange  — code → access_token (refresh_token сохраняем в KV)
      if (url.pathname === '/exchange' && req.method === 'POST') {
        const { code, redirect_uri } = await req.json();

        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id:     env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri,
            grant_type:    'authorization_code',
          }),
        });

        const tokens = await tokenResp.json();
        if (tokens.error) return Response.json({ error: tokens.error, error_description: tokens.error_description }, { status: 400, headers: CORS });

        const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const user = await userResp.json();

        if (tokens.refresh_token) {
          await env.TOKENS.put(`rt:${user.sub}`, tokens.refresh_token);
        }

        return Response.json({
          access_token: tokens.access_token,
          expires_in:   tokens.expires_in,
          user,
        }, { headers: CORS });
      }

      // POST /refresh  — user_id → новый access_token
      if (url.pathname === '/refresh' && req.method === 'POST') {
        const { user_id } = await req.json();

        const rt = await env.TOKENS.get(`rt:${user_id}`);
        if (!rt) return Response.json({ error: 'no_session' }, { status: 401, headers: CORS });

        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: rt,
            client_id:     env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            grant_type:    'refresh_token',
          }),
        });

        const tokens = await tokenResp.json();
        if (tokens.error) return Response.json({ error: tokens.error }, { status: 401, headers: CORS });

        return Response.json({
          access_token: tokens.access_token,
          expires_in:   tokens.expires_in,
        }, { headers: CORS });
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: CORS });
    }
  },
};
