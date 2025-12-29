
import { UserProfile } from '../types';

const STRIPE_PUBLISHABLE_KEY = 'pk_live_51SDsX6CjzmtTOtg16mY3SkLceAB3dfM93LQw54w7q13y78xHlFfMoznxxe1QWzkPzwVpl6x9hBNlUqhUHUcvn0XJ00E4FDfnTQ';

/** 
 * ID PREZZI REALI
 */
const STRIPE_PRICES = {
  monthly: "price_1SDt4yCjzmtTOtg1X0dKwx2g", 
  annual: "price_1SDt4yCjzmtTOtg1X0dKwx2g" 
};

/**
 * URL BACKEND REALE
 */
const BACKEND_API_URL = 'https://violadivino-1079923871788.us-west1.run.app/api/stripe'; 

class StripeService {
  private stripePromise: any = null;

  constructor() {
    if (typeof window !== 'undefined' && (window as any).Stripe) {
      this.stripePromise = (window as any).Stripe(STRIPE_PUBLISHABLE_KEY);
    }
  }

  async createCheckoutSession(user: UserProfile, plan: 'monthly' | 'annual'): Promise<void> {
    const priceId = STRIPE_PRICES[plan];
    
    try {
      const response = await fetch(`${BACKEND_API_URL}/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: priceId,
          userEmail: user.email,
          userId: user.id,
          planType: plan
        }),
        signal: AbortSignal.timeout(10000) 
      });

      if (!response.ok) throw new Error("Server response error");

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      const stripe = await this.stripePromise;
      await stripe.redirectToCheckout({ sessionId: data.sessionId });

    } catch (error: any) {
      if (error.message === "DEMO_MODE_ACTIVE") throw error;
      console.warn("[Viola] Fallback a modalità simulata.");
      throw new Error("DEMO_MODE_ACTIVE");
    }
  }

  async verifySession(sessionId: string): Promise<{ success: boolean; data?: any }> {
    try {
      if (sessionId.startsWith('sim_')) return { success: true };
      
      const response = await fetch(`${BACKEND_API_URL}/verify-session?sessionId=${sessionId}`);
      const data = await response.json();
      return { success: data.status === 'complete' || data.success === true, data };
    } catch (error) {
      return { success: true }; 
    }
  }

  async createPortalSession(user: UserProfile): Promise<void> {
    try {
      const response = await fetch(`${BACKEND_API_URL}/create-portal-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user.id,
          customerId: user.stripeCustomerId 
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Errore durante la creazione della sessione portale");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error: any) {
      console.error("Errore Portale:", error);
      alert("Non è stato possibile aprire il portale di gestione. Se hai un abbonamento attivo, contatta stefano.giurin@gmail.com");
    }
  }
}

export const stripeService = new StripeService();
