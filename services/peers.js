// peers.js
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");

const peers = new Map();
const broadcasters = new Map();

function createPeer(ws) {
  const id = uuidv4();
  peers.set(id, { 
    ws, 
    role: null, 
    monitor_number: null, 
    name: null, 
    isAlive: true, 
    watchingBroadcaster: null,
    missedPings: 0,
    lastSeen: Date.now()
  });

  // configurar heartbeat para este peer
  ws.on('pong', () => {
    const peer = peers.get(id);
    if (peer) {
      peer.isAlive = true;
      peer.missedPings = 0;
      peer.lastSeen = Date.now();
    }
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

// Heartbeat global - verifica a cada 1 minuto
function setupHeartbeat() {
  setInterval(() => {
    const now = Date.now();
    const TWO_MINUTES = 2 * 60 * 1000;
    
    for (const [id, peer] of peers) {
      const inactiveDuration = now - peer.lastSeen;
      
      // Remover peers inativos há mais de 2 minutos
      if (inactiveDuration > TWO_MINUTES) {
        console.log(`❌ Peer inativo há ${(inactiveDuration/1000).toFixed(0)}s: ${id} (${peer.role || 'unknown'}), removendo...`);
        peer.ws.terminate();
        deletePeer(id);
        continue;
      }
      
      // Incrementar contador de pings perdidos se não respondeu
      if (!peer.isAlive) {
        peer.missedPings++;
        console.log(`⚠️ Peer ${id} (${peer.role || 'unknown'}) não respondeu ao ping (${peer.missedPings} pings perdidos)`);
      }
      
      // Enviar ping
      peer.isAlive = false;
      try {
        peer.ws.ping();
      } catch (err) {
        console.log(`❌ Erro ao enviar ping para ${id}: ${err.message}`);
        deletePeer(id);
      }
    }
    
    console.log(`💓 Health check: ${peers.size} peer(s) ativos, ${broadcasters.size} broadcaster(s)`);
  }, 60000); // a cada 1 minuto
}

module.exports = { peers, broadcasters, createPeer, deletePeer, setupHeartbeat };
