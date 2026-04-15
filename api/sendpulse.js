export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { email, listId } = req.body || {};
  if (!email || !listId) return res.status(400).json({ error: 'Missing email or listId' });

  try {
    // 1. Get SendPulse OAuth token
    const tokenRes = await fetch('https://api.sendpulse.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: 'sp_id_cb7103ee1b39a4e7e6409a97c69c4e8b',
        client_secret: 'sp_sk_cee022063fb75ff1dd6a1e09bd959d39',
      }),
    });
    const { access_token } = await tokenRes.json();

    // 2. Add email to mailing list
    await fetch(`https://api.sendpulse.com/addressbooks/${listId}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`,
      },
      body: JSON.stringify({ emails: [{ email }] }),
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
