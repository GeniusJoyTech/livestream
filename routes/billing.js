const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../jwt/authMiddleware');
const billingService = require('../services/billingService');
const { getStripePublishableKey } = require('../services/stripeClient');

router.get('/pricing', authenticateToken, async (req, res) => {
  try {
    const pricing = await billingService.getPricingConfig();
    res.json(pricing);
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

router.get('/subscription', authenticateToken, async (req, res) => {
  try {
    const subscription = await billingService.getSubscription(req.user.id);
    const usage = await billingService.getOwnerUsageStats(req.user.id);
    res.json({ subscription, usage });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

router.post('/subscription', authenticateToken, async (req, res) => {
  try {
    const { planType, broadcasterLimit, viewerLimit, broadcasterGroupLimit } = req.body;
    const subscription = await billingService.createOrUpdateSubscription(req.user.id, {
      planType,
      broadcasterLimit,
      viewerLimit,
      broadcasterGroupLimit
    });
    
    const isExempt = await billingService.isUserExempt(req.user.id);
    if (!isExempt) {
      const openInvoices = await billingService.getOpenInvoices(req.user.id);
      if (openInvoices.length === 0) {
        const now = new Date();
        const periodStart = now;
        const periodEnd = new Date(now);
        if (planType === 'annual') {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        }
        
        try {
          await billingService.createInvoice(req.user.id, periodStart, periodEnd);
          console.log(`📄 Fatura gerada automaticamente para owner ${req.user.id}`);
        } catch (invoiceError) {
          console.error('Error creating invoice:', invoiceError);
        }
      }
    }
    
    res.json(subscription);
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

router.put('/subscription/limits', authenticateToken, async (req, res) => {
  try {
    const { broadcasterLimit, viewerLimit, broadcasterGroupLimit } = req.body;
    const subscription = await billingService.updateSubscriptionLimits(
      req.user.id, broadcasterLimit, viewerLimit, broadcasterGroupLimit
    );
    res.json(subscription);
  } catch (error) {
    console.error('Error updating limits:', error);
    res.status(500).json({ error: 'Failed to update limits' });
  }
});

router.get('/invoices', authenticateToken, async (req, res) => {
  try {
    const invoices = await billingService.getAllInvoices(req.user.id);
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

router.get('/invoices/open', authenticateToken, async (req, res) => {
  try {
    const invoices = await billingService.getOpenInvoices(req.user.id);
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching open invoices:', error);
    res.status(500).json({ error: 'Failed to fetch open invoices' });
  }
});

router.get('/invoices/:id', authenticateToken, async (req, res) => {
  try {
    const invoice = await billingService.getInvoiceById(req.params.id);
    if (!invoice || invoice.owner_id !== req.user.id) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

router.post('/checkout', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const session = await billingService.createCheckoutSession(
      req.user.id,
      invoiceId,
      `${baseUrl}/billing/success?invoice=${invoiceId}`,
      `${baseUrl}/billing/cancel?invoice=${invoiceId}`
    );
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.post('/pix', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.body;
    const paymentIntent = await billingService.createPixPayment(req.user.id, invoiceId);
    res.json(paymentIntent);
  } catch (error) {
    console.error('Error creating PIX payment:', error);
    res.status(500).json({ error: 'Failed to create PIX payment' });
  }
});

router.get('/stripe-key', authenticateToken, async (req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error) {
    console.error('Error fetching Stripe key:', error);
    res.status(500).json({ error: 'Failed to fetch Stripe key' });
  }
});

router.get('/can-access', authenticateToken, async (req, res) => {
  try {
    const canAccess = await billingService.canAccessSystem(req.user.id);
    res.json({ canAccess });
  } catch (error) {
    console.error('Error checking access:', error);
    res.status(500).json({ error: 'Failed to check access' });
  }
});

router.post('/create-customer', authenticateToken, async (req, res) => {
  try {
    const db = require('../database/db');
    const userResult = await db.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    const email = userResult.rows[0]?.email;
    
    if (!email) {
      return res.status(400).json({ error: 'User email not found' });
    }
    
    const customer = await billingService.createStripeCustomer(req.user.id, email);
    res.json({ customerId: customer.id });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

module.exports = router;
