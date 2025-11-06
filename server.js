require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { setupWebSocket } = require("./setupWebSocket");

const app = express();
const server = http.createServer(app);
const PORT = 8080;

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
// Em produção, substitua por DB
// ===========================
const users = [
  {
    id: 1,
    username: "admin",
    passwordHash: bcrypt.hashSync("123456", 10), // senha: 123456
  },
];

// ===========================
// Gerar Token JWT
// ===========================
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

// ===========================
// Middleware de autenticação
// ===========================
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token ausente" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido" });
    req.user = user;
    next();
  });
}

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

// Exemplo de rota protegida
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
