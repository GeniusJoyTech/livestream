require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const bcrypt = require("bcrypt");
const { setupWebSocket } = require("./setupWebsocket");
const { generateToken } = require("./jwt/jwtUtils");
const { authenticateToken } = require("./jwt/authMiddleware");

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

// ===========================
// Mock de usuários
// ===========================
const users = [
  {
    id: 1,
    username: "admin",
    passwordHash: bcrypt.hashSync("123456", 10),
  },
];

// ===========================
// Rotas HTTP
// ===========================

// Redireciona raiz para login
app.get("/", (req, res) => {
  res.redirect("/login/login.html");
});

// Rota de login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = users.find((u) => u.username === username);
  if (!user) return res.status(400).json({ error: "Usuário não encontrado" });

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) return res.status(401).json({ error: "Senha incorreta" });

  const token = generateToken(user);
  res.json({ message: "Login bem-sucedido", token });
});

// Rota protegida
app.get("/protected", authenticateToken, (req, res) => {
  res.json({ message: `Olá, ${req.user.username}! Você está autenticado.` });
});

// ===========================
// Inicializa WebSocket com JWT
// ===========================
setupWebSocket(server);

// ===========================
// Inicializa servidor
// ===========================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
