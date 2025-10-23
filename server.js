// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 8080;

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Estruturas de dados
// peers: Map<id, { ws, role }>
const peers = new Map();

// broadcasters: Map<broadcasterId, ws>
const broadcasters = new Map();

wss.on('connection', (ws) => {
  const id = uuidv4();
  ws.id = id;
  peers.set(id, { ws, role: null });

  console.log(`🔗 Novo peer conectado: ${id}`);

  ws.on('message', (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      console.error('Mensagem inválida:', message);
      return;
    }

    switch (msg.type) {

      // =======================
      // Registrando Broadcaster
      // =======================
      case 'broadcaster':
        peers.get(id).role = 'broadcaster';
        broadcasters.set(id, ws);
        console.log(`✅ Broadcaster conectado: ${id}`);
        break;

      // =======================
      // Registrando Viewer
      // =======================
      case 'viewer':
        peers.get(id).role = 'viewer';
        console.log(`👀 Viewer conectado: ${id}`);

        // enviar lista de broadcasters ativos
        const activeBroadcasters = [...broadcasters.keys()];
        ws.send(JSON.stringify({
          type: 'broadcaster-list',
          broadcasters: activeBroadcasters
        }));
        break;

      // =======================
      // Viewer escolhe broadcaster
      // =======================
      case 'watch':
        const broadcasterId = msg.targetId;
        if (broadcasters.has(broadcasterId)) {
          const broadcasterWs = broadcasters.get(broadcasterId);
          if (broadcasterWs.readyState === WebSocket.OPEN) {
            broadcasterWs.send(JSON.stringify({
              type: 'new-viewer',
              viewerId: id
            }));
          }
        }
        break;

      // =======================
      // WebRTC Offer
      // =======================
      case 'offer':
        if (msg.targetId && peers.has(msg.targetId)) {
          const targetWs = peers.get(msg.targetId).ws;
          if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'offer',
              sdp: msg.sdp,
              senderId: id
            }));
          }
        }
        break;

      // =======================
      // WebRTC Answer
      // =======================
      case 'answer':
        if (msg.targetId && peers.has(msg.targetId)) {
          const targetWs = peers.get(msg.targetId).ws;
          if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'answer',
              sdp: msg.sdp,
              senderId: id
            }));
          }
        }
        break;

      // =======================
      // ICE Candidate
      // =======================
      case 'candidate':
        if (msg.targetId && peers.has(msg.targetId)) {
          const targetWs = peers.get(msg.targetId).ws;
          if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'candidate',
              candidate: msg.candidate,
              senderId: id
            }));
          }
        }
        break;
    }
  });

  // =======================
  // Peer desconectado
  // =======================
  ws.on('close', () => {
    const peer = peers.get(id);
    if (!peer) return;

    console.log(`❌ Peer desconectado: ${id} (${peer.role})`);

    if (peer.role === 'broadcaster') {
      broadcasters.delete(id);
      // avisar viewers que esse broadcaster saiu
      for (const [vid, vpeer] of peers) {
        if (vpeer.role === 'viewer' && vpeer.ws.readyState === WebSocket.OPEN) {
          vpeer.ws.send(JSON.stringify({
            type: 'broadcaster-left',
            broadcasterId: id
          }));
        }
      }
    }

    peers.delete(id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
