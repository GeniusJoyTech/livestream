require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const { setupWebSocket } = require("./setupWebsocket");
const { generateToken } = require("./jwt/jwtUtils");
const { authenticateToken } = require("./jwt/authMiddleware");
const db = require("./database/db");
const userService = require("./services/userService");
const databaseStorage = require("./services/databaseStorage");
const billingService = require("./services/billingService");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// ===========================
// Stripe Webhook Route (BEFORE express.json())
// ===========================
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const WebhookHandlers = require('./services/webhookHandlers');
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer.');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body, sig);
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// ===========================
// Middleware (AFTER webhook route)
// ===========================
app.use(express.json());

// ===========================
// Servir arquivos estáticos
// ===========================
app.use(express.static(path.join(__dirname, "./public")));
app.use("/viewer", express.static(path.join(__dirname, "./public/viewer")));
app.use("/login", express.static(path.join(__dirname, "./public/login")));
app.use("/register", express.static(path.join(__dirname, "./public/register")));
app.use("/owner-dashboard", express.static(path.join(__dirname, "./public/owner-dashboard")));
app.use("/master", express.static(path.join(__dirname, "./public/master")));
app.use("/billing", express.static(path.join(__dirname, "./public/billing")));

// ===========================
// Rotas HTTP
// ===========================

// Redireciona raiz para login
app.get("/", (req, res) => {
  res.redirect("/login/login.html");
});

// Rota de login com banco de dados
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    
    const user = await userService.validateCredentials(username, password);
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    const isMaster = await billingService.isMasterUser(user.id);
    
    const token = generateToken({ 
      type: 'user',
      id: user.id, 
      username: user.username, 
      role: user.role,
      isMaster: isMaster
    });
    
    await userService.logAuditAction(user.id, 'USER_LOGIN', 'user', user.id, req.ip, req.get('user-agent'));
    
    res.json({ 
      message: "Login successful", 
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isMaster: isMaster
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Rota protegida
app.get("/protected", authenticateToken, (req, res) => {
  res.json({ message: `Olá, ${req.user.username}! Você está autenticado.` });
});

// Rotas de usuários
const usersRouter = require("./routes/users");
app.use("/api/users", usersRouter);

// Rotas de broadcasters
const broadcastersRouter = require("./routes/broadcasters");
app.use("/api/broadcasters", broadcastersRouter);

// Rotas de relatórios
const reportsRouter = require("./routes/reports");
app.use("/api/reports", reportsRouter);

// Rotas de billing
const billingRouter = require("./routes/billing");
app.use("/api/billing", billingRouter);

// Rotas master
const masterRouter = require("./routes/master");
app.use("/api/master", masterRouter);

// ===========================
// Inicializa Banco de Dados
// ===========================
async function initializeDatabase() {
  if (process.env.DATABASE_URL) {
    console.log('📦 Initializing database...');
    await db.initializeDatabase();
    
    const fs = require('fs');
    const billingSchemaPath = path.join(__dirname, 'database/billing-schema.sql');
    if (fs.existsSync(billingSchemaPath)) {
      const billingSchema = fs.readFileSync(billingSchemaPath, 'utf8');
      try {
        await db.query(billingSchema);
        console.log('✅ Billing schema initialized successfully');
      } catch (error) {
        if (!error.message.includes('already exists')) {
          console.error('Error initializing billing schema:', error.message);
        }
      }
    }
    
    setInterval(async () => {
      try {
        await databaseStorage.cleanOldData();
      } catch (error) {
        console.error('Error during scheduled cleanup:', error);
      }
    }, 24 * 60 * 60 * 1000);
    
    setInterval(async () => {
      try {
        await billingService.checkAndProcessOverdueInvoices();
      } catch (error) {
        console.error('Error processing overdue invoices:', error);
      }
    }, 60 * 60 * 1000);
    
    try {
      const exemptResult = await db.query(
        `SELECT u.id FROM users u 
         WHERE LOWER(u.email) = 'ana.rodrigues@simplificacontabilidade.com.br'`
      );
      
      if (exemptResult.rows.length > 0) {
        const userId = exemptResult.rows[0].id;
        await db.query(
          `UPDATE users SET is_master_admin = true WHERE id = $1`,
          [userId]
        );
        await db.query(
          `INSERT INTO exempt_users (user_id, reason, is_active)
           VALUES ($1, 'Usuário fundador - isento permanentemente', true)
           ON CONFLICT (user_id) DO UPDATE SET is_active = true`,
          [userId]
        );
        console.log(`✅ Usuário ana.rodrigues marcado como isento e master admin`);
      }
    } catch (exemptError) {
      console.log('Note: Could not check exempt user status');
    }
  } else {
    console.warn('⚠️  DATABASE_URL not set - database features disabled');
  }
}

async function initializeStripe() {
  if (process.env.REPLIT_CONNECTORS_HOSTNAME) {
    try {
      const { runMigrations } = await import('stripe-replit-sync');
      const { getStripeSync } = require('./services/stripeClient');
      
      console.log('💳 Initializing Stripe schema...');
      await runMigrations({ 
        databaseUrl: process.env.DATABASE_URL,
        schema: 'stripe'
      });
      console.log('✅ Stripe schema ready');
      
      const stripeSync = await getStripeSync();
      
      const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      try {
        const { webhook } = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        console.log(`💳 Webhook configured: ${webhook?.url || webhookBaseUrl}`);
      } catch (webhookError) {
        console.log('💳 Webhook will be configured when Stripe connection is complete');
      }
      
      stripeSync.syncBackfill()
        .then(() => console.log('✅ Stripe data synced'))
        .catch((err) => console.error('Error syncing Stripe data:', err.message));
        
    } catch (error) {
      console.warn('⚠️ Stripe initialization skipped:', error.message);
    }
  }
}

async function initializeApp() {
  try {
    await initializeDatabase();
    await initializeStripe();
  } catch (error) {
    console.error('❌ Initialization error:', error);
    console.warn('⚠️  Running with limited features');
  }
  
  setupWebSocket(server);
  
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  });
}

initializeApp();
