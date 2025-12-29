
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // Indirizzo dell'app in produzione fornito dall'utente
  const appUrl = 'https://violadivino-1079923871788.us-west1.run.app';
  
  // Impostazione degli header CORS
  res.setHeader('Access-Control-Allow-Origin', appUrl);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Gestione della richiesta preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Accetta solo richieste POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' });
  }

  try {
    const { priceId, userId, userEmail, couponCode } = req.body;

    // Verifica dei campi obbligatori
    if (!priceId || !userId || !userEmail) {
      return res.status(400).json({ error: 'Campi obbligatori mancanti: priceId, userId o userEmail' });
    }

    // Configurazione della sessione di checkout Stripe
    const sessionConfig = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      // Utilizziamo il sistema di routing dell'app tramite il parametro "view"
      success_url: `${appUrl}/?view=CHECKOUT_SUCCESS&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?view=CHECKOUT_CANCEL`,
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: { userId },
      subscription_data: { metadata: { userId } },
      billing_address_collection: 'auto'
    };

    // Gestione del coupon sconto
    if (couponCode && couponCode.trim()) {
      try {
        const coupon = await stripe.coupons.retrieve(couponCode.trim().toUpperCase());
        sessionConfig.discounts = [{ coupon: coupon.id }];
      } catch (err) {
        console.log('Coupon non trovato o non valido:', couponCode);
        // Se il coupon non è valido, permettiamo l'inserimento manuale di codici promozionali
        sessionConfig.allow_promotion_codes = true;
      }
    } else {
      // Abilita i codici promozionali se non è specificato un coupon fisso
      sessionConfig.allow_promotion_codes = true;
    }

    // Creazione della sessione di checkout
    const session = await stripe.checkout.sessions.create(sessionConfig);
    
    // Restituiamo l'URL e l'ID per compatibilità con il frontend
    return res.status(200).json({ 
      url: session.url,
      sessionId: session.id 
    });

  } catch (error) {
    console.error('Errore durante il checkout:', error);
    return res.status(500).json({ error: error.message });
  }
}
