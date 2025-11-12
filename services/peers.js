// peers.js
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");

const peers = new Map();
const broadcasters = new Map();

function createPeer(ws) {
  const id = uuidv4();
  peers.set(id, { ws, role: null, monitor_number: null, name: null, isAlive: true });

  // configurar heartbeat para este peer
  ws.on('pong', () => {
    const peer = peers.get(id);
    if (peer) peer.isAlive = true;
  });

  ws.on('close', () => {
    deletePeer(id);
    console.log(`❌ Peer desconectado: ${id}`);
  });

  return id;
}

function deletePeer(id) {
  peers.delete(id);
  broadcasters.delete(id);
}

// Heartbeat global
function setupHeartbeat() {
  setInterval(() => {
    for (const [id, peer] of peers) {
      if (!peer.isAlive) {
        console.log(`❌ Peer inativo: ${id}, removendo...`);
        peer.ws.terminate();
        deletePeer(id);
        continue;
      }
      peer.isAlive = false;
      peer.ws.ping();
    }
  }, 30000); // a cada 30s
}

module.exports = { peers, broadcasters, createPeer, deletePeer, setupHeartbeat };
