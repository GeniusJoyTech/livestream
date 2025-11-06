const WebSocket = require("ws");  // ✅ adicionar isso

function relayMessage(id, msg, peers) {
  const targetPeer = peers.get(msg.targetId);
  if (!targetPeer) return;

  const targetWs = targetPeer.ws;
  if (targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(JSON.stringify({
      type: msg.type,
      sdp: msg.sdp,
      candidate: msg.candidate,
      senderId: id,
    }));
  }
}

module.exports = { relayMessage };
