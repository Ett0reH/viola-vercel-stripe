import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://viola2.base44.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { priceId, userId, userEmail, couponCode } = req.body;
    if (!priceId || !userId || !userEmail) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const sessionConfig = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'https://viola2.base44.app/CheckoutSuccess?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://viola2.base44.app/CheckoutCancel',
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: { userId },
      subscription_data: { metadata: { userId } },
      billing_address_collection: 'auto'
    };

    if (couponCode && couponCode.trim()) {
      try {
        const coupon = await stripe.coupons.retrieve(couponCode.trim().toUpperCase());
        sessionConfig.discounts = [{ coupon: coupon.id }];
      } catch (err) {
        console.log('Coupon not found:', couponCode);
        sessionConfig.allow_promotion_codes = true;
      }
    } else {
      sessionConfig.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: error.message });
  }
}
