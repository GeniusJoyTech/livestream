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
const peers = new Map();        // Map<id, { ws, role, monitor_number }>
const broadcasters = new Map(); // Map<broadcasterId, { ws, monitor_number }>

wss.on('connection', (ws) => {
  const id = uuidv4();
  ws.id = id;
  peers.set(id, { ws, role: null, monitor_number: null });

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
        peers.get(id).monitor_number = msg.monitor_number;
        broadcasters.set(id, { ws, monitor_number: msg.monitor_number });
        console.log(`✅ Broadcaster conectado: ${id} (Monitor: ${msg.monitor_number})`);
        break;

      // =======================
      // Registrando Viewer
      // =======================
      case 'viewer':
        peers.get(id).role = 'viewer';
        console.log(`👀 Viewer conectado: ${id}`);

        const activeBroadcasters = [...broadcasters.keys()];
        ws.send(JSON.stringify({
          type: 'broadcaster-list',
          broadcasters: activeBroadcasters
        }));
        break;

      // =======================
      // Viewer escolhe broadcaster e monitor
      // =======================
      case 'watch':
        const broadcasterId = msg.targetId;
        const selectedMonitor = msg.monitor_number || 1;

        if (broadcasters.has(broadcasterId)) {
          const broadcasterWs = broadcasters.get(broadcasterId).ws;

          if (broadcasterWs.readyState === WebSocket.OPEN) {
            // Envia notificação ao broadcaster sobre novo viewer e monitor escolhido
            broadcasterWs.send(JSON.stringify({
              type: 'new-viewer',
              viewerId: id,
              monitor_number: selectedMonitor  // Passa o monitor escolhido pelo viewer
            }));

            // Envia confirmação ao viewer
            ws.send(JSON.stringify({
              type: 'viewer-joined',
              monitor_number: selectedMonitor
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
      // Avisar viewers que broadcaster saiu
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
