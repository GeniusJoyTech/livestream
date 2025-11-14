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

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// ===========================
// Middleware
// ===========================
app.use(express.json());

// ===========================
// Servir arquivos estáticos
// ===========================
app.use("/viewer", express.static(path.join(__dirname, "./public/viewer")));
app.use("/login", express.static(path.join(__dirname, "./public/login")));
app.use("/register", express.static(path.join(__dirname, "./public/register")));

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
    
    const token = generateToken({ 
      type: 'user',
      id: user.id, 
      username: user.username, 
      role: user.role 
    });
    
    await userService.logAuditAction(user.id, 'USER_LOGIN', 'user', user.id, req.ip, req.get('user-agent'));
    
    res.json({ 
      message: "Login successful", 
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
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

// ===========================
// Inicializa Banco de Dados
// ===========================
async function initializeApp() {
  try {
    if (process.env.DATABASE_URL) {
      console.log('📦 Initializing database...');
      await db.initializeDatabase();
      
      setInterval(async () => {
        try {
          await databaseStorage.cleanOldData();
        } catch (error) {
          console.error('Error during scheduled cleanup:', error);
        }
      }, 24 * 60 * 60 * 1000);
    } else {
      console.warn('⚠️  DATABASE_URL not set - database features disabled');
      console.warn('⚠️  Please create a PostgreSQL database in Replit to enable all features');
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    console.warn('⚠️  Running without database - some features may not work');
  }
  
  setupWebSocket(server);
  
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  });
}

initializeApp();
