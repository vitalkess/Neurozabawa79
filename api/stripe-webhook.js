import crypto from 'crypto';

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(payload, sig, secret) {
  const parts = sig.split(',').reduce((acc, part) => {
    const [key, val] = part.split('=');
    acc[key] = val;
    return acc;
  }, {});

  const signedPayload = `${parts.t}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(parts.v1 || '', 'hex'),
    Buffer.from(expected, 'hex')
  );
}

async function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  });
}

async function addToSendPulse(email, listId) {
  try {
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

    await fetch(`https://api.sendpulse.com/addressbooks/${listId}/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`,
      },
      body: JSON.stringify({ emails: [{ email }] }),
    });
  } catch (_) {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Verify signature
  try {
    if (!verifyStripeSignature(rawBody.toString(), sig, secret)) {
      return res.status(400).send('Invalid signature');
    }
  } catch {
    return res.status(400).send('Signature error');
  }

  const event = JSON.parse(rawBody.toString());

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email || '—';
    const name = session.customer_details?.name || '—';
    const amountTotal = session.amount_total || 0;
    const amount = (amountTotal / 100).toFixed(2).replace('.', ',');
    const currency = (session.currency || 'pln').toUpperCase();

    const message =
      `✅ <b>Нова оплата!</b>\n\n` +
      `💰 <b>${amount} ${currency}</b>\n` +
      `👤 ${name}\n` +
      `📧 ${email}`;

    await sendTelegram(message);

    // Add to SendPulse mailing list based on purchase amount
    // 4997 grosze = 49,97 zł (NeiroBook) → list 642238
    // 4697 grosze = 46,97 zł (Zestaw)    → list 642240
    if (email !== '—') {
      const listId = amountTotal === 4697 ? '642240' : '642238';
      await addToSendPulse(email, listId);
    }
  }

  res.status(200).json({ received: true });
}
