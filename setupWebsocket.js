const WebSocket = require("ws");
const url = require("url");
const jwt = require("jsonwebtoken");
const { peers, broadcasters, createPeer, deletePeer, setupHeartbeat } = require("./services/peers");
const { registerBroadcaster, registerViewer, handleWatch, relayMessage, handleDisconnect, handleMonitoring, handleTokenRenewal } = require("./handlers/handlers");

// inicia o heartbeat global para todos os peers
setupHeartbeat();

function setupWebSocket(server) {
  // maxPayload: rejeita mensagens acima de 2 MB para evitar estouro de memória
  const wss = new WebSocket.Server({ server, maxPayload: 2 * 1024 * 1024 });

  wss.on("connection", (ws, req) => {
    // Trata erros da conexão (ex.: payload acima do limite) sem derrubar o processo.
    // Registrado ANTES de qualquer validação/early-return para cobrir todas as conexões.
    ws.on("error", (err) => {
      console.warn(`⚠️ Erro na conexão WebSocket (${err.code || err.message}) — encerrando conexão`);
      try { ws.terminate(); } catch {}
    });

    // Extrai parâmetros da URL
    const params = url.parse(req.url, true);
    const { role, token } = params.query;

    // Autenticação seletiva: só viewers exigem JWT
    if (role === "viewer") {
      if (!token) {
        ws.close(4001, "Token não fornecido (viewer precisa autenticar)");
        return;
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        ws.user = decoded; // guarda dados do viewer (id, username, etc)
        ws.role = "viewer";
        console.log("✅ Viewer autenticado:", ws.user.username);
      } catch (err) {
        console.log("❌ Token JWT inválido:", err.message);
        ws.close(4002, "Token inválido");
        return;
      }
    } else if (role === "broadcaster") {
      ws.role = "broadcaster";
      console.log("🎥 Broadcaster conectado (sem autenticação JWT)");
    } else {
      ws.close(4003, "Papel (role) não especificado");
      return;
    }

    // Criação do ID do peer e registro do heartbeat individual
    const id = createPeer(ws);
    console.log(`🔗 Novo peer conectado: ${id}`);

    // Recebe mensagens dos peers e chama os handlers adequados
    ws.on("message", async (message) => {
      let msg;
      try {
        msg = JSON.parse(message);
      } catch {
        console.error("Mensagem inválida:", message);
        return;
      }

      switch (msg.type) {
        case "broadcaster":
          await registerBroadcaster(ws, id, msg, peers, broadcasters);
          break;
        case "viewer":
          await registerViewer(ws, id, peers, broadcasters);
          break;
        case "watch":
          await handleWatch(ws, id, msg, peers, broadcasters);
          break;
        case "offer":
        case "answer":
        case "candidate":
          relayMessage(id, msg, peers);
          break;
        case "monitoring":
          await handleMonitoring(id, msg, peers, broadcasters);
          break;
        case "renew-token":
          await handleTokenRenewal(ws, id, broadcasters);
          break;
      }
    });

    // Tratamento de fechamento de conexão
    ws.on("close", async () => await handleDisconnect(ws, id, peers, broadcasters, deletePeer));
  });

  console.log("🛰️ WebSocket server rodando com autenticação seletiva (só viewers)");
}

module.exports = { setupWebSocket };
