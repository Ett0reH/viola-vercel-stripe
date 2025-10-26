import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Funzione per salvare log su base44
async function saveWebhookLog(eventType, eventId, userId, userEmail, status, payload, errorMessage = null) {
  try {
    const response = await fetch('https://viola2.base44.app/api/entities/WebhookLog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Aggiungi qui l'autenticazione se necessaria
      },
      body: JSON.stringify({
        event_type: eventType,
        event_id: eventId,
        user_id: userId,
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

    let userId = null;
    let userEmail = null;

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        userId = session.client_reference_id || session.metadata?.userId;
        userEmail = session.customer_email || session.customer_details?.email;
        
        await saveWebhookLog(
          event.type,
          event.id,
          userId,
          userEmail,
          'success',
          event.data.object
        );
        
        console.log('💳 Payment completed for:', userEmail);
        break;

      case 'customer.subscription.deleted':
      case 'customer.subscription.canceled':
        const subscription = event.data.object;
        userId = subscription.metadata?.userId;
        
        // Ottieni email dal customer
        try {
          const customer = await stripe.customers.retrieve(subscription.customer);
          userEmail = customer.email;
        } catch (err) {
          console.error('Error getting customer:', err);
        }
        
        await saveWebhookLog(
          event.type,
          event.id,
          userId,
          userEmail,
          'pending',
          event.data.object
        );
        
        console.log('❌ Subscription canceled for:', userEmail);
        break;

      case 'invoice.payment_failed':
        const invoice = event.data.object;
        userId = invoice.subscription_metadata?.userId;
        userEmail = invoice.customer_email;
        
        await saveWebhookLog(
          event.type,
          event.id,
          userId,
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
    
    // Salva anche gli errori
    await saveWebhookLog(
      'webhook.error',
      'error_' + Date.now(),
      null,
      null,
      'error',
      { error: err.message },
      err.message
    );
    
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}
