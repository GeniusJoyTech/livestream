const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const uuidv4 = require('uuid/v4');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 8080;

app.use(express.static(path.join(__dirname, 'public')));

// Armazena peers: { id: { ws, role } }
const peers = new Map();

let broadcasterId = null;

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
      case 'broadcaster':
        peers.get(id).role = 'broadcaster';
        broadcasterId = id;
        console.log(`✅ Broadcaster conectado: ${id}`);
        break;

      case 'viewer':
        peers.get(id).role = 'viewer';
        console.log(`👀 Viewer conectado: ${id}`);

        // Avisar broadcaster que tem novo viewer
        if (broadcasterId && peers.has(broadcasterId)) {
          const broadcasterWs = peers.get(broadcasterId).ws;
          if (broadcasterWs.readyState === WebSocket.OPEN) {
            broadcasterWs.send(JSON.stringify({
              type: 'new-viewer',
              viewerId: id
            }));
          }
        }
        break;

      case 'offer':
        // msg.targetId é quem deve receber a offer
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

      case 'answer':
        // answer vai para broadcaster
        if (broadcasterId && peers.has(broadcasterId)) {
          const broadcasterWs = peers.get(broadcasterId).ws;
          if (broadcasterWs.readyState === WebSocket.OPEN) {
            broadcasterWs.send(JSON.stringify({
              type: 'answer',
              sdp: msg.sdp,
              senderId: id
            }));
          }
        }
        break;

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

  ws.on('close', () => {
    const peer = peers.get(id);
    if (!peer) return;

    console.log(`❌ Peer desconectado: ${id} (${peer.role})`);

    if (peer.role === 'broadcaster') {
      broadcasterId = null;
      // Opcional: avisar viewers que broadcaster saiu
      for (const [vid, vpeer] of peers) {
        if (vpeer.role === 'viewer' && vpeer.ws.readyState === WebSocket.OPEN) {
          vpeer.ws.send(JSON.stringify({ type: 'broadcaster-left' }));
        }
      }
    }

    peers.delete(id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
