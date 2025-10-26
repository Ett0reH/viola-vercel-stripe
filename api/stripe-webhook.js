import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const BASE44_API_URL = 'https://api.base44.app'; // URL API base44
const BASE44_APP_ID = 'viola2'; // Il tuo app ID

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Funzione per salvare log su base44
async function saveWebhookLog(eventType, eventId, userEmail, status, payload, errorMessage = null) {
  try {
    const response = await fetch(`${BASE44_API_URL}/apps/${BASE44_APP_ID}/entities/WebhookLog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BASE44_API_KEY}` // Da aggiungere su Vercel
      },
      body: JSON.stringify({
        event_type: eventType,
        event_id: eventId,
        user_email: userEmail,
        status: status,
        payload: payload,
        error_message: errorMessage,
        processed: false
      })
    });
    
    if (!response.ok) {
      console.error('Failed to save webhook log:', await response.text());
    }
  } catch (err) {
    console.error('Error saving webhook log:', err);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);

    console.log('✅ Webhook received:', event.type);

    let userEmail = null;

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        userEmail = session.customer_details?.email || session.metadata?.userEmail;
        
        await saveWebhookLog(
          event.type,
          event.id,
          userEmail,
          'success',
          event.data.object
        );
        
        console.log('💳 Payment completed for:', userEmail);
        break;

      case 'customer.subscription.deleted':
      case 'customer.subscription.canceled':
        const subscription = event.data.object;
        userEmail = subscription.metadata?.userEmail;
        
        await saveWebhookLog(
          event.type,
          event.id,
          userEmail,
          'success',
          event.data.object
        );
        
        console.log('❌ Subscription canceled for:', userEmail);
        break;

      case 'invoice.payment_failed':
        const invoice = event.data.object;
        userEmail = invoice.customer_email;
        
        await saveWebhookLog(
          event.type,
          event.id,
          userEmail,
          'error',
          event.data.object,
          'Payment failed'
        );
        
        console.log('⚠️ Payment failed for:', userEmail);
        break;

      default:
        console.log('ℹ️ Unhandled event type:', event.type);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    
    await saveWebhookLog(
      'webhook_error',
      'unknown',
      null,
      'error',
      { error: err.message },
      err.message
    );
    
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}
