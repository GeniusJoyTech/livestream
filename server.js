const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 8080;

// Servir arquivos estáticos (ex: viewer.html)
app.use(express.static(path.join(__dirname, "./public/viewer")));


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, './public/viewer', 'viewer.html'));
});

// Estruturas de dados
// peers: Map<id, { ws, role, monitor_number, name }>
const peers = new Map();
// broadcasters: Map<broadcasterId, { ws, monitor_number, name }>
const broadcasters = new Map();

wss.on("connection", (ws) => {
  const id = uuidv4();
  ws.id = id;
  peers.set(id, { ws, role: null, monitor_number: null, name: null });

  console.log(`🔗 Novo peer conectado: ${id}`);

  ws.on("message", (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      console.error("Mensagem inválida:", message);
      return;
    }

    switch (msg.type) {
      // =======================
      // 🔴 Registrando Broadcaster
      // =======================
      case "broadcaster":
        peers.get(id).role = "broadcaster";
        peers.get(id).monitor_number = msg.monitor_number;
        peers.get(id).name = msg.broadcaster_name || `Broadcaster ${id.slice(0, 6)}`;

        broadcasters.set(id, {
          ws,
          monitor_number: msg.monitor_number,
          name: msg.broadcaster_name || `Broadcaster ${id.slice(0, 6)}`,
        });

        console.log(`✅ Broadcaster conectado: ${peers.get(id).name} (Monitor ${msg.monitor_number}) `, new Date(Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }));

        // Notifica todos os viewers sobre o novo broadcaster
        for (const [vid, vpeer] of peers) {
          if (vpeer.role === "viewer" && vpeer.ws.readyState === WebSocket.OPEN) {
            vpeer.ws.send(
              JSON.stringify({
                type: "new-broadcaster",
                broadcasterId: id,
                broadcaster_name: peers.get(id).name,
              })
            );
          }
        }
        break;

      // =======================
      // 🟢 Registrando Viewer
      // =======================
      case "viewer":
        peers.get(id).role = "viewer";
        console.log(`👀 Viewer conectado: ${id} `, new Date(Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }));

        // Envia lista de broadcasters ativos com nomes
        const activeBroadcasters = [...broadcasters.entries()].map(([bid, bdata]) => ({
          id: bid,
          name: bdata.name,
        }));

        ws.send(
          JSON.stringify({
            type: "broadcaster-list",
            broadcasters: activeBroadcasters,
          })
        );
        break;
      // =======================
      // 🧭 Viewer escolhe broadcaster e monitor
      // =======================
      case "watch":
        const broadcasterId = msg.targetId;
        const selectedMonitor = msg.monitor_number || 1;

        if (broadcasters.has(broadcasterId)) {
          const broadcasterData = broadcasters.get(broadcasterId);
          const broadcasterWs = broadcasterData.ws;

          if (broadcasterWs.readyState === WebSocket.OPEN) {
            // Notifica broadcaster sobre novo viewer
            broadcasterWs.send(
              JSON.stringify({
                type: "new-viewer",
                viewerId: id,
                monitor_number: selectedMonitor,
              })
            );

            // Confirma para o viewer
            ws.send(
              JSON.stringify({
                type: "viewer-joined",
                monitor_number: selectedMonitor,
                broadcaster_name: broadcasterData.name,
              })
            );
          }
        }
        break;
      // =======================
      // 🔄 WebRTC Offer
      // =======================
      case "offer":
        if (msg.targetId && peers.has(msg.targetId)) {
          const targetWs = peers.get(msg.targetId).ws;
          if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(
              JSON.stringify({
                type: "offer",
                sdp: msg.sdp,
                senderId: id,
              })
            );
          }
        }
        break;
      // =======================
      // 🔁 WebRTC Answer
      // =======================
      case "answer":
        if (msg.targetId && peers.has(msg.targetId)) {
          const targetWs = peers.get(msg.targetId).ws;
          if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(
              JSON.stringify({
                type: "answer",
                sdp: msg.sdp,
                senderId: id,
              })
            );
          }
        }
        break;
      // =======================
      // ❄️ ICE Candidate
      // =======================
      case "candidate":
        if (msg.targetId && peers.has(msg.targetId)) {
          const targetWs = peers.get(msg.targetId).ws;
          if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(
              JSON.stringify({
                type: "candidate",
                candidate: msg.candidate,
                senderId: id,
              })
            );
          }
        }
        break;
    }
  });
  // =======================
  // ❌ Peer desconectado
  // =======================
  ws.on("close", () => {
    const peer = peers.get(id);
    if (!peer) return;

    console.log(`❌ Peer desconectado: ${id} (${peer.role}) `, new Date(Date.now()).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }));

    if (peer.role === "broadcaster") {
      broadcasters.delete(id);
      // Avisa todos os viewers que o broadcaster saiu
      for (const [vid, vpeer] of peers) {
        if (vpeer.role === "viewer" && vpeer.ws.readyState === WebSocket.OPEN) {
          vpeer.ws.send(
            JSON.stringify({
              type: "broadcaster-left",
              broadcasterId: id,
            })
          );
        }
      }
    }

    peers.delete(id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
