import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'No signature' });

  try {
    const buf = await buffer(req);
    const event = stripe.webhooks.constructEvent(
      buf, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET
    );

    const userId = event.data.object.metadata?.userId || 
                   event.data.object.client_reference_id;

    if (!userId) return res.status(200).json({ received: true });

    // Aggiorna user su base44 (richiede API key base44)
    console.log(`Event ${event.type} for user ${userId}`);

    return res.status(200).json({ received: true });
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}