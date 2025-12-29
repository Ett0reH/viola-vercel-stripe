
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const BASE44_API_URL = 'https://api.base44.app'; // URL API base44
const BASE44_APP_ID = 'viola2'; // Il tuo app ID mantenuto come riferimento

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Funzione per salvare i log delle transazioni nel tuo database/CRM (base44)
 */
async function saveWebhookLog(eventType, eventId, userEmail, userId, status, payload, errorMessage = null) {
  try {
    const response = await fetch(`${BASE44_API_URL}/apps/${BASE44_APP_ID}/entities/WebhookLog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BASE44_API_KEY}`
      },
      body: JSON.stringify({
        event_type: eventType,
        event_id: eventId,
        user_email: userEmail,
        user_id: userId,
        status: status,
        payload: payload,
        error_message: errorMessage,
        processed: false,
        source: 'https://violadivino-1079923871788.us-west1.run.app'
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
  // Impostiamo l'origine corretta per la tua app in produzione
  const appUrl = 'https://violadivino-1079923871788.us-west1.run.app';
  res.setHeader('Access-Control-Allow-Origin', appUrl);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
    console.log('✅ Webhook ricevuto:', event.type);

    const dataObject = event.data.object;
    
    // Estrazione dati unificata dai metadati Stripe
    const userId = dataObject.client_reference_id || dataObject.metadata?.userId || (dataObject.subscription_data?.metadata?.userId);
    const userEmail = dataObject.customer_email || dataObject.customer_details?.email || dataObject.metadata?.userEmail;

    switch (event.type) {
      case 'checkout.session.completed':
        console.log('💳 Pagamento completato per:', userEmail || userId);
        await saveWebhookLog(event.type, event.id, userEmail, userId, 'success', dataObject);
        break;

      case 'customer.subscription.deleted':
      case 'customer.subscription.canceled':
        console.log('❌ Abbonamento terminato per:', userEmail || userId);
        await saveWebhookLog(event.type, event.id, userEmail, userId, 'success', dataObject);
        break;

      case 'invoice.payment_failed':
        console.log('⚠️ Pagamento fallito per:', userEmail || userId);
        await saveWebhookLog(event.type, event.id, userEmail, userId, 'error', dataObject, 'Payment failed');
        break;

      default:
        console.log('ℹ️ Evento non gestito specificamente:', event.type);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    
    // Log dell'errore tecnico nel sistema
    await saveWebhookLog('webhook_error', 'unknown', null, null, 'error', { error: err.message }, err.message);
    
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}
