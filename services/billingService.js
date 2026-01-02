const db = require('../database/db');
const { getStripeClient } = require('./stripeClient');

class BillingService {
  
  async getPricingConfig() {
    const result = await db.query(
      `SELECT * FROM pricing_config WHERE is_active = true`
    );
    return result.rows;
  }
  
  async updatePricingConfig(resourceType, dailyValue, monthlyDiscount, annualDiscount) {
    const result = await db.query(
      `UPDATE pricing_config 
       SET daily_value = $2, monthly_discount_percent = $3, annual_discount_percent = $4
       WHERE resource_type = $1
       RETURNING *`,
      [resourceType, dailyValue, monthlyDiscount, annualDiscount]
    );
    return result.rows[0];
  }
  
  async getBillingDatesConfig() {
    const result = await db.query(
      `SELECT * FROM billing_dates_config WHERE is_active = true`
    );
    return result.rows;
  }
  
  async updateBillingDatesConfig(planType, config) {
    const result = await db.query(
      `UPDATE billing_dates_config 
       SET invoice_open_days_before = $2, due_day = $3, grace_period_days = $4, 
           discount_deadline_day = $5, inactivation_day = $6
       WHERE plan_type = $1
       RETURNING *`,
      [planType, config.invoiceOpenDaysBefore, config.dueDay, config.gracePeriodDays, 
       config.discountDeadlineDay, config.inactivationDay]
    );
    return result.rows[0];
  }
  
  async isUserExempt(userId) {
    const result = await db.query(
      `SELECT eu.*, u.email, u.username 
       FROM exempt_users eu
       JOIN users u ON u.id = eu.user_id
       WHERE eu.user_id = $1 AND eu.is_active = true`,
      [userId]
    );
    return result.rows.length > 0;
  }
  
  async isUserExemptByEmail(email) {
    const result = await db.query(
      `SELECT eu.*, u.email, u.username 
       FROM exempt_users eu
       JOIN users u ON u.id = eu.user_id
       WHERE LOWER(u.email) = LOWER($1) AND eu.is_active = true`,
      [email]
    );
    return result.rows.length > 0;
  }
  
  async addExemptUser(userId, reason, exemptedBy) {
    const result = await db.query(
      `INSERT INTO exempt_users (user_id, reason, exempted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET reason = $2, is_active = true
       RETURNING *`,
      [userId, reason, exemptedBy]
    );
    return result.rows[0];
  }
  
  async removeExemptUser(userId) {
    const result = await db.query(
      `UPDATE exempt_users SET is_active = false WHERE user_id = $1 RETURNING *`,
      [userId]
    );
    return result.rows[0];
  }
  
  async getSubscription(ownerId) {
    const result = await db.query(
      `SELECT * FROM subscriptions WHERE owner_id = $1`,
      [ownerId]
    );
    return result.rows[0];
  }
  
  async createOrUpdateSubscription(ownerId, data) {
    const existing = await this.getSubscription(ownerId);
    
    if (existing) {
      const result = await db.query(
        `UPDATE subscriptions 
         SET plan_type = COALESCE($2, plan_type),
             broadcaster_limit = COALESCE($3, broadcaster_limit),
             viewer_limit = COALESCE($4, viewer_limit),
             broadcaster_group_limit = COALESCE($5, broadcaster_group_limit),
             stripe_customer_id = COALESCE($6, stripe_customer_id),
             status = COALESCE($7, status)
         WHERE owner_id = $1
         RETURNING *`,
        [ownerId, data.planType, data.broadcasterLimit, data.viewerLimit, 
         data.broadcasterGroupLimit, data.stripeCustomerId, data.status]
      );
      return result.rows[0];
    } else {
      const result = await db.query(
        `INSERT INTO subscriptions (owner_id, plan_type, broadcaster_limit, viewer_limit, broadcaster_group_limit, stripe_customer_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [ownerId, data.planType || 'monthly', data.broadcasterLimit || 0, data.viewerLimit || 0, 
         data.broadcasterGroupLimit || 0, data.stripeCustomerId, data.status || 'pending']
      );
      return result.rows[0];
    }
  }
  
  async updateSubscriptionLimits(ownerId, broadcasterLimit, viewerLimit, broadcasterGroupLimit) {
    const subscription = await this.getSubscription(ownerId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }
    
    const pricing = await this.getPricingConfig();
    const pricingMap = {};
    pricing.forEach(p => { pricingMap[p.resource_type] = p; });
    
    if (broadcasterLimit !== undefined && broadcasterLimit !== subscription.broadcaster_limit) {
      await db.query(
        `INSERT INTO limit_changes (subscription_id, change_type, old_value, new_value, daily_value_at_change)
         VALUES ($1, 'broadcaster', $2, $3, $4)`,
        [subscription.id, subscription.broadcaster_limit, broadcasterLimit, pricingMap.broadcaster?.daily_value || 0]
      );
    }
    
    if (viewerLimit !== undefined && viewerLimit !== subscription.viewer_limit) {
      await db.query(
        `INSERT INTO limit_changes (subscription_id, change_type, old_value, new_value, daily_value_at_change)
         VALUES ($1, 'viewer', $2, $3, $4)`,
        [subscription.id, subscription.viewer_limit, viewerLimit, pricingMap.viewer?.daily_value || 0]
      );
    }
    
    if (broadcasterGroupLimit !== undefined && broadcasterGroupLimit !== subscription.broadcaster_group_limit) {
      await db.query(
        `INSERT INTO limit_changes (subscription_id, change_type, old_value, new_value, daily_value_at_change)
         VALUES ($1, 'broadcaster_group', $2, $3, $4)`,
        [subscription.id, subscription.broadcaster_group_limit, broadcasterGroupLimit, pricingMap.broadcaster_group?.daily_value || 0]
      );
    }
    
    const result = await db.query(
      `UPDATE subscriptions 
       SET broadcaster_limit = COALESCE($2, broadcaster_limit),
           viewer_limit = COALESCE($3, viewer_limit),
           broadcaster_group_limit = COALESCE($4, broadcaster_group_limit)
       WHERE owner_id = $1
       RETURNING *`,
      [ownerId, broadcasterLimit, viewerLimit, broadcasterGroupLimit]
    );
    
    return result.rows[0];
  }
  
  async calculateDailyValue(subscription) {
    const pricing = await this.getPricingConfig();
    const pricingMap = {};
    pricing.forEach(p => { pricingMap[p.resource_type] = parseFloat(p.daily_value); });
    
    const broadcasterValue = (subscription.broadcaster_limit || 0) * (pricingMap.broadcaster || 0);
    const viewerValue = (subscription.viewer_limit || 0) * (pricingMap.viewer || 0);
    const groupValue = (subscription.broadcaster_group_limit || 0) * (pricingMap.broadcaster_group || 0);
    
    return broadcasterValue + viewerValue + groupValue;
  }
  
  async calculatePeriodValue(subscription, days = 30) {
    const dailyValue = await this.calculateDailyValue(subscription);
    return dailyValue * days;
  }
  
  async calculateValueWithDiscount(subscription, days = 30) {
    const pricing = await this.getPricingConfig();
    const baseValue = await this.calculatePeriodValue(subscription, days);
    
    let discountPercent = 0;
    if (subscription.plan_type === 'monthly') {
      discountPercent = parseFloat(pricing[0]?.monthly_discount_percent || 0);
    } else if (subscription.plan_type === 'annual') {
      discountPercent = parseFloat(pricing[0]?.annual_discount_percent || 0);
    }
    
    const discountValue = baseValue * (discountPercent / 100);
    return {
      baseValue,
      discountPercent,
      discountValue,
      finalValue: baseValue - discountValue
    };
  }
  
  async generateInvoiceNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    const result = await db.query(
      `SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE $1`,
      [`INV-${year}${month}-%`]
    );
    
    const sequence = parseInt(result.rows[0].count) + 1;
    return `INV-${year}${month}-${String(sequence).padStart(5, '0')}`;
  }
  
  async createInvoice(ownerId, periodStart, periodEnd) {
    const subscription = await this.getSubscription(ownerId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }
    
    const billingConfig = await this.getBillingDatesConfig();
    const config = billingConfig.find(c => c.plan_type === subscription.plan_type);
    
    const days = Math.ceil((new Date(periodEnd) - new Date(periodStart)) / (1000 * 60 * 60 * 24));
    const valueCalc = await this.calculateValueWithDiscount(subscription, days);
    
    const invoiceNumber = await this.generateInvoiceNumber();
    
    const dueDate = new Date(periodEnd);
    dueDate.setDate(config?.due_day || 20);
    
    const discountDeadline = new Date(dueDate);
    discountDeadline.setDate(config?.discount_deadline_day || 20);
    
    const gracePeriodEnd = new Date(dueDate);
    gracePeriodEnd.setDate(dueDate.getDate() + (config?.grace_period_days || 8));
    
    const result = await db.query(
      `INSERT INTO invoices (subscription_id, owner_id, invoice_number, period_start, period_end, 
                            broadcaster_count, viewer_count, broadcaster_group_count,
                            contracted_value, discount_value, final_value, 
                            discount_deadline, due_date, grace_period_end, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'open')
       RETURNING *`,
      [subscription.id, ownerId, invoiceNumber, periodStart, periodEnd,
       subscription.broadcaster_limit, subscription.viewer_limit, subscription.broadcaster_group_limit,
       valueCalc.baseValue, valueCalc.discountValue, valueCalc.finalValue,
       discountDeadline, dueDate, gracePeriodEnd]
    );
    
    return result.rows[0];
  }
  
  async getOpenInvoices(ownerId) {
    const result = await db.query(
      `SELECT * FROM invoices WHERE owner_id = $1 AND status = 'open' ORDER BY due_date ASC`,
      [ownerId]
    );
    return result.rows;
  }
  
  async getAllInvoices(ownerId) {
    const result = await db.query(
      `SELECT * FROM invoices WHERE owner_id = $1 ORDER BY created_at DESC`,
      [ownerId]
    );
    return result.rows;
  }
  
  async getInvoiceById(invoiceId) {
    const result = await db.query(
      `SELECT * FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    return result.rows[0];
  }
  
  async markInvoicePaid(invoiceId, paymentMethod, stripePaymentId) {
    const result = await db.query(
      `UPDATE invoices 
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP, payment_method = $2, stripe_payment_intent_id = $3
       WHERE id = $1
       RETURNING *`,
      [invoiceId, paymentMethod, stripePaymentId]
    );
    
    if (result.rows[0]) {
      await db.query(
        `UPDATE subscriptions SET status = 'active', consecutive_unpaid_months = 0 
         WHERE id = $1`,
        [result.rows[0].subscription_id]
      );
    }
    
    return result.rows[0];
  }
  
  async createStripeCustomer(ownerId, email) {
    const stripe = await getStripeClient();
    
    const customer = await stripe.customers.create({
      email,
      metadata: { ownerId: String(ownerId) }
    });
    
    await this.createOrUpdateSubscription(ownerId, { stripeCustomerId: customer.id });
    
    return customer;
  }
  
  async createCheckoutSession(ownerId, invoiceId, successUrl, cancelUrl) {
    const stripe = await getStripeClient();
    const subscription = await this.getSubscription(ownerId);
    const invoice = await this.getInvoiceById(invoiceId);
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    const now = new Date();
    const discountDeadline = new Date(invoice.discount_deadline);
    const applyDiscount = now <= discountDeadline;
    
    const amount = applyDiscount ? invoice.final_value : invoice.contracted_value;
    const amountInCents = Math.round(parseFloat(amount) * 100);
    
    const session = await stripe.checkout.sessions.create({
      customer: subscription.stripe_customer_id,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Fatura ${invoice.invoice_number}`,
            description: `Período: ${new Date(invoice.period_start).toLocaleDateString('pt-BR')} a ${new Date(invoice.period_end).toLocaleDateString('pt-BR')}`
          },
          unit_amount: amountInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        invoiceId: String(invoiceId),
        ownerId: String(ownerId)
      }
    });
    
    return session;
  }
  
  async createPixPayment(ownerId, invoiceId) {
    const stripe = await getStripeClient();
    const subscription = await this.getSubscription(ownerId);
    const invoice = await this.getInvoiceById(invoiceId);
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    const now = new Date();
    const discountDeadline = new Date(invoice.discount_deadline);
    const applyDiscount = now <= discountDeadline;
    
    const amount = applyDiscount ? invoice.final_value : invoice.contracted_value;
    const amountInCents = Math.round(parseFloat(amount) * 100);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'brl',
      customer: subscription.stripe_customer_id,
      payment_method_types: ['pix'],
      metadata: {
        invoiceId: String(invoiceId),
        ownerId: String(ownerId)
      }
    });
    
    await db.query(
      `INSERT INTO payments (invoice_id, amount, payment_method, stripe_payment_id, status)
       VALUES ($1, $2, 'pix', $3, 'pending')`,
      [invoiceId, amount, paymentIntent.id]
    );
    
    return paymentIntent;
  }
  
  async suspendUser(ownerId) {
    await db.query(
      `UPDATE subscriptions SET status = 'suspended', suspended_at = CURRENT_TIMESTAMP 
       WHERE owner_id = $1`,
      [ownerId]
    );
    
    await db.query(
      `UPDATE users SET is_active = false WHERE id = $1`,
      [ownerId]
    );
    
    await db.query(
      `UPDATE broadcasters SET is_active = false WHERE owner_id = $1`,
      [ownerId]
    );
  }
  
  async reactivateUser(ownerId) {
    await db.query(
      `UPDATE subscriptions SET status = 'active', suspended_at = NULL 
       WHERE owner_id = $1`,
      [ownerId]
    );
    
    await db.query(
      `UPDATE users SET is_active = true WHERE id = $1`,
      [ownerId]
    );
    
    await db.query(
      `UPDATE broadcasters SET is_active = true WHERE owner_id = $1`,
      [ownerId]
    );
  }
  
  async checkAndProcessOverdueInvoices() {
    const now = new Date();
    
    const overdueResult = await db.query(
      `SELECT i.*, s.owner_id, u.email 
       FROM invoices i
       JOIN subscriptions s ON s.id = i.subscription_id
       JOIN users u ON u.id = i.owner_id
       WHERE i.status = 'open' AND i.grace_period_end < $1`,
      [now]
    );
    
    for (const invoice of overdueResult.rows) {
      await db.query(
        `UPDATE invoices SET status = 'overdue' WHERE id = $1`,
        [invoice.id]
      );
      
      await db.query(
        `UPDATE subscriptions 
         SET consecutive_unpaid_months = consecutive_unpaid_months + 1 
         WHERE id = $1`,
        [invoice.subscription_id]
      );
      
      const subResult = await db.query(
        `SELECT * FROM subscriptions WHERE id = $1`,
        [invoice.subscription_id]
      );
      
      const subscription = subResult.rows[0];
      
      if (subscription.consecutive_unpaid_months >= 3) {
        await db.query(
          `UPDATE subscriptions SET status = 'cancelled' WHERE id = $1`,
          [subscription.id]
        );
        await db.query(
          `DELETE FROM users WHERE id = $1`,
          [invoice.owner_id]
        );
        console.log(`Conta ${invoice.owner_id} excluída por 3 meses de inadimplência`);
      } else {
        await this.suspendUser(invoice.owner_id);
        console.log(`Conta ${invoice.owner_id} suspensa por inadimplência`);
      }
    }
    
    return overdueResult.rows.length;
  }
  
  async getAllSubscriptions() {
    const result = await db.query(
      `SELECT s.*, u.username, u.email, 
              (SELECT COUNT(*) FROM invoices WHERE subscription_id = s.id AND status = 'open') as open_invoices,
              (SELECT SUM(final_value) FROM invoices WHERE subscription_id = s.id AND status = 'paid') as total_paid
       FROM subscriptions s
       JOIN users u ON u.id = s.owner_id
       ORDER BY s.created_at DESC`
    );
    return result.rows;
  }
  
  async getAllInvoicesForMaster() {
    const result = await db.query(
      `SELECT i.*, u.username, u.email
       FROM invoices i
       JOIN users u ON u.id = i.owner_id
       ORDER BY i.created_at DESC`
    );
    return result.rows;
  }
  
  async isMasterUser(userId) {
    const result = await db.query(
      `SELECT * FROM master_users WHERE user_id = $1 AND is_active = true`,
      [userId]
    );
    return result.rows.length > 0;
  }
  
  async addMasterUser(userId) {
    const result = await db.query(
      `INSERT INTO master_users (user_id) VALUES ($1) 
       ON CONFLICT (user_id) DO UPDATE SET is_active = true
       RETURNING *`,
      [userId]
    );
    return result.rows[0];
  }
  
  async canAccessSystem(userId) {
    const isMaster = await this.isMasterUser(userId);
    if (isMaster) return true;
    
    const isExempt = await this.isUserExempt(userId);
    if (isExempt) return true;
    
    const subscription = await this.getSubscription(userId);
    if (!subscription) return false;
    
    return subscription.status === 'active';
  }
  
  async getOwnerUsageStats(ownerId) {
    const broadcastersResult = await db.query(
      `SELECT COUNT(*) as count FROM broadcasters WHERE owner_id = $1 AND is_active = true`,
      [ownerId]
    );
    
    const viewersResult = await db.query(
      `SELECT COUNT(*) as count FROM users WHERE created_by = $1 AND role = 'viewer' AND is_active = true`,
      [ownerId]
    );
    
    const groupsResult = await db.query(
      `SELECT COUNT(*) as count FROM broadcaster_groups WHERE owner_id = $1 AND is_active = true`,
      [ownerId]
    );
    
    return {
      broadcasters: parseInt(broadcastersResult.rows[0]?.count || 0),
      viewers: parseInt(viewersResult.rows[0]?.count || 0),
      broadcasterGroups: parseInt(groupsResult.rows[0]?.count || 0)
    };
  }
}

module.exports = new BillingService();
