const express = require("express");
const http = require("http");
const path = require("path");
const { setupWebSocket } = require("./setupWebSocket");

const app = express();
const server = http.createServer(app);
const PORT = 8080;

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, "./public/viewer")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "./public/viewer/viewer.html"));
});

// Inicializa WebSocket
setupWebSocket(server);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
