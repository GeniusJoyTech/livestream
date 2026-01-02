const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../jwt/authMiddleware');
const billingService = require('../services/billingService');
const db = require('../database/db');

async function requireMaster(req, res, next) {
  try {
    const isMaster = await billingService.isMasterUser(req.user.id);
    if (!isMaster) {
      return res.status(403).json({ error: 'Access denied. Master user required.' });
    }
    next();
  } catch (error) {
    console.error('Error checking master status:', error);
    res.status(500).json({ error: 'Failed to verify master status' });
  }
}

router.get('/check', authenticateToken, async (req, res) => {
  try {
    const isMaster = await billingService.isMasterUser(req.user.id);
    res.json({ isMaster });
  } catch (error) {
    console.error('Error checking master status:', error);
    res.status(500).json({ error: 'Failed to check master status' });
  }
});

router.get('/pricing', authenticateToken, requireMaster, async (req, res) => {
  try {
    const pricing = await billingService.getPricingConfig();
    res.json(pricing);
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

router.put('/pricing/:resourceType', authenticateToken, requireMaster, async (req, res) => {
  try {
    const { resourceType } = req.params;
    const { dailyValue, monthlyDiscount, annualDiscount } = req.body;
    
    const updated = await billingService.updatePricingConfig(
      resourceType, dailyValue, monthlyDiscount, annualDiscount
    );
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating pricing:', error);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
});

router.get('/billing-dates', authenticateToken, requireMaster, async (req, res) => {
  try {
    const config = await billingService.getBillingDatesConfig();
    res.json(config);
  } catch (error) {
    console.error('Error fetching billing dates:', error);
    res.status(500).json({ error: 'Failed to fetch billing dates config' });
  }
});

router.put('/billing-dates/:planType', authenticateToken, requireMaster, async (req, res) => {
  try {
    const { planType } = req.params;
    const config = req.body;
    
    const updated = await billingService.updateBillingDatesConfig(planType, config);
    res.json(updated);
  } catch (error) {
    console.error('Error updating billing dates:', error);
    res.status(500).json({ error: 'Failed to update billing dates config' });
  }
});

router.get('/subscriptions', authenticateToken, requireMaster, async (req, res) => {
  try {
    const subscriptions = await billingService.getAllSubscriptions();
    res.json(subscriptions);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

router.get('/invoices', authenticateToken, requireMaster, async (req, res) => {
  try {
    const invoices = await billingService.getAllInvoicesForMaster();
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

router.get('/exempt-users', authenticateToken, requireMaster, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT eu.*, u.username, u.email 
       FROM exempt_users eu
       JOIN users u ON u.id = eu.user_id
       WHERE eu.is_active = true`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching exempt users:', error);
    res.status(500).json({ error: 'Failed to fetch exempt users' });
  }
});

router.post('/exempt-users', authenticateToken, requireMaster, async (req, res) => {
  try {
    const { userId, reason } = req.body;
    
    const masterResult = await db.query(
      `SELECT id FROM master_users WHERE user_id = $1`,
      [req.user.id]
    );
    
    const exempted = await billingService.addExemptUser(
      userId, reason, masterResult.rows[0].id
    );
    
    res.json(exempted);
  } catch (error) {
    console.error('Error adding exempt user:', error);
    res.status(500).json({ error: 'Failed to add exempt user' });
  }
});

router.delete('/exempt-users/:userId', authenticateToken, requireMaster, async (req, res) => {
  try {
    const removed = await billingService.removeExemptUser(req.params.userId);
    res.json({ success: true, removed });
  } catch (error) {
    console.error('Error removing exempt user:', error);
    res.status(500).json({ error: 'Failed to remove exempt user' });
  }
});

router.post('/generate-invoice', authenticateToken, requireMaster, async (req, res) => {
  try {
    const { ownerId, periodStart, periodEnd } = req.body;
    const invoice = await billingService.createInvoice(ownerId, periodStart, periodEnd);
    res.json(invoice);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

router.post('/suspend-user/:ownerId', authenticateToken, requireMaster, async (req, res) => {
  try {
    await billingService.suspendUser(req.params.ownerId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

router.post('/reactivate-user/:ownerId', authenticateToken, requireMaster, async (req, res) => {
  try {
    await billingService.reactivateUser(req.params.ownerId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error reactivating user:', error);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

router.post('/process-overdue', authenticateToken, requireMaster, async (req, res) => {
  try {
    const count = await billingService.checkAndProcessOverdueInvoices();
    res.json({ processedCount: count });
  } catch (error) {
    console.error('Error processing overdue invoices:', error);
    res.status(500).json({ error: 'Failed to process overdue invoices' });
  }
});

router.get('/users', authenticateToken, requireMaster, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.role, u.is_active, u.created_at,
              (SELECT COUNT(*) FROM broadcasters WHERE owner_id = u.id) as broadcaster_count,
              (SELECT COUNT(*) FROM users v WHERE v.created_by = u.id AND v.role = 'viewer') as viewer_count
       FROM users u
       WHERE u.role = 'owner'
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/stats', authenticateToken, requireMaster, async (req, res) => {
  try {
    const totalUsers = await db.query(`SELECT COUNT(*) as count FROM users WHERE role = 'owner'`);
    const activeSubscriptions = await db.query(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'`);
    const suspendedSubscriptions = await db.query(`SELECT COUNT(*) as count FROM subscriptions WHERE status = 'suspended'`);
    const openInvoices = await db.query(`SELECT COUNT(*) as count, COALESCE(SUM(final_value), 0) as total FROM invoices WHERE status = 'open'`);
    const paidInvoices = await db.query(`SELECT COUNT(*) as count, COALESCE(SUM(final_value), 0) as total FROM invoices WHERE status = 'paid'`);
    const overdueInvoices = await db.query(`SELECT COUNT(*) as count, COALESCE(SUM(final_value), 0) as total FROM invoices WHERE status = 'overdue'`);
    
    res.json({
      totalOwners: parseInt(totalUsers.rows[0].count),
      activeSubscriptions: parseInt(activeSubscriptions.rows[0].count),
      suspendedSubscriptions: parseInt(suspendedSubscriptions.rows[0].count),
      openInvoices: {
        count: parseInt(openInvoices.rows[0].count),
        total: parseFloat(openInvoices.rows[0].total)
      },
      paidInvoices: {
        count: parseInt(paidInvoices.rows[0].count),
        total: parseFloat(paidInvoices.rows[0].total)
      },
      overdueInvoices: {
        count: parseInt(overdueInvoices.rows[0].count),
        total: parseFloat(overdueInvoices.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/add-master/:userId', authenticateToken, requireMaster, async (req, res) => {
  try {
    const added = await billingService.addMasterUser(req.params.userId);
    res.json(added);
  } catch (error) {
    console.error('Error adding master user:', error);
    res.status(500).json({ error: 'Failed to add master user' });
  }
});

router.delete('/users/:userId', authenticateToken, requireMaster, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta' });
    }
    
    const userCheck = await db.query(
      `SELECT u.*, eu.id as exempt_id, mu.id as master_id 
       FROM users u 
       LEFT JOIN exempt_users eu ON eu.user_id = u.id AND eu.is_active = true
       LEFT JOIN master_users mu ON mu.user_id = u.id AND mu.is_active = true
       WHERE u.id = $1`,
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const user = userCheck.rows[0];
    
    if (user.master_id) {
      return res.status(400).json({ error: 'Não é possível excluir um usuário master. Remova o status de master primeiro.' });
    }
    
    await db.query('BEGIN');
    
    try {
      await db.query(`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE owner_id = $1)`, [userId]);
      await db.query(`DELETE FROM invoices WHERE owner_id = $1`, [userId]);
      await db.query(`DELETE FROM limit_changes WHERE subscription_id IN (SELECT id FROM subscriptions WHERE owner_id = $1)`, [userId]);
      await db.query(`DELETE FROM subscriptions WHERE owner_id = $1`, [userId]);
      await db.query(`DELETE FROM exempt_users WHERE user_id = $1`, [userId]);
      
      const broadcasters = await db.query(`SELECT id FROM broadcasters WHERE owner_id = $1`, [userId]);
      const broadcasterIds = broadcasters.rows.map(b => b.id);
      
      if (broadcasterIds.length > 0) {
        await db.query(`DELETE FROM activities WHERE broadcaster_id = ANY($1)`, [broadcasterIds]);
        await db.query(`DELETE FROM browser_history WHERE broadcaster_id = ANY($1)`, [broadcasterIds]);
        await db.query(`DELETE FROM broadcaster_installations WHERE broadcaster_id = ANY($1)`, [broadcasterIds]);
        await db.query(`DELETE FROM viewer_permissions WHERE broadcaster_id = ANY($1)`, [broadcasterIds]);
      }
      
      await db.query(`DELETE FROM broadcasters WHERE owner_id = $1`, [userId]);
      await db.query(`DELETE FROM users WHERE created_by = $1`, [userId]);
      await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
      
      await db.query('COMMIT');
      
      console.log(`🗑️ Usuário ${user.username} (ID: ${userId}) excluído pelo master ${req.user.id}`);
      
      res.json({ success: true, message: 'Usuário excluído com sucesso' });
    } catch (deleteError) {
      await db.query('ROLLBACK');
      throw deleteError;
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Falha ao excluir usuário: ' + error.message });
  }
});

module.exports = router;
