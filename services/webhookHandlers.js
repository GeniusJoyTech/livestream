const { getStripeSync } = require('./stripeClient');
const billingService = require('./billingService');
const db = require('../database/db');

class WebhookHandlers {
  static async processWebhook(payload, signature) {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    const event = await sync.processWebhook(payload, signature);
    
    if (event) {
      await this.handleEvent(event);
    }
  }
  
  static async handleEvent(event) {
    console.log(`📩 Stripe webhook received: ${event.type}`);
    
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object);
        break;
        
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
        
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }
  
  static async handlePaymentSuccess(paymentIntent) {
    const invoiceId = paymentIntent.metadata?.invoiceId;
    const paymentMethod = paymentIntent.payment_method_types?.[0] === 'pix' ? 'pix' : 'credit_card';
    
    if (invoiceId) {
      await billingService.markInvoicePaid(invoiceId, paymentMethod, paymentIntent.id);
      
      await db.query(
        `UPDATE payments SET status = 'succeeded', paid_at = CURRENT_TIMESTAMP 
         WHERE stripe_payment_id = $1`,
        [paymentIntent.id]
      );
      
      console.log(`✅ Invoice ${invoiceId} marked as paid via ${paymentMethod}`);
    }
  }
  
  static async handlePaymentFailed(paymentIntent) {
    const invoiceId = paymentIntent.metadata?.invoiceId;
    
    if (invoiceId) {
      await db.query(
        `UPDATE payments SET status = 'failed' WHERE stripe_payment_id = $1`,
        [paymentIntent.id]
      );
      
      console.log(`❌ Payment failed for invoice ${invoiceId}`);
    }
  }
  
  static async handleCheckoutCompleted(session) {
    const invoiceId = session.metadata?.invoiceId;
    const ownerId = session.metadata?.ownerId;
    
    if (invoiceId && session.payment_status === 'paid') {
      await billingService.markInvoicePaid(invoiceId, 'credit_card', session.payment_intent);
      console.log(`✅ Checkout completed for invoice ${invoiceId}`);
    }
  }
}

module.exports = WebhookHandlers;
