const WebSocket = require("ws");

function registerBroadcaster(ws, id, msg, peers, broadcasters) {
  const peer = peers.get(id);
  peer.role = "broadcaster";
  peer.monitor_number = msg.monitor_number;
  peer.name = msg.broadcaster_name || `Broadcaster ${id.slice(0,6)}`;
  peer.company_id = msg.company_id || "-1";

  broadcasters.set(id, {
    ws,
    monitor_number: msg.monitor_number,
    name: peer.name,
    company_id: peer.company_id,
  });

  console.log(`✅ Broadcaster conectado: ${peer.name} (Monitor ${msg.monitor_number}, company_id: ${peer.company_id})`);

  for (const [, vpeer] of peers) {
    if (vpeer.role === "viewer" && vpeer.ws.readyState === ws.OPEN) {
      vpeer.ws.send(JSON.stringify({
        type: "new-broadcaster",
        broadcasterId: id,
        broadcaster_name: peer.name,
      }));
    }
  }
}
function registerViewer(ws, id, peers, broadcasters) {
  const peer = peers.get(id);
  peer.role = "viewer";

  const activeBroadcasters = [...broadcasters.entries()].map(([bid, bdata]) => ({
    id: bid,
    name: bdata.name,
  }));

  ws.send(JSON.stringify({
    type: "broadcaster-list",
    broadcasters: activeBroadcasters,
  }));
}
function handleDisconnect(ws, id, peers, broadcasters, deletePeer) {
  const peer = peers.get(id);
  if (!peer) return;

  console.log(`❌ Peer desconectado: ${id} (${peer.role})`);

  if (peer.role === "broadcaster") {
    broadcasters.delete(id);

    for (const [, vpeer] of peers) {
      if (vpeer.role === "viewer" && vpeer.ws.readyState === ws.OPEN) {
        vpeer.ws.send(JSON.stringify({
          type: "broadcaster-left",
          broadcasterId: id,
        }));
      }
    }
  }

  deletePeer(id);
}
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
function handleWatch(ws, id, msg, peers, broadcasters) {
  const broadcasterId = msg.targetId;
  const monitor = msg.monitor_number || 1;

  if (!broadcasters.has(broadcasterId)) return;
  const { ws: bws, name } = broadcasters.get(broadcasterId);

  if (bws.readyState === WebSocket.OPEN) {
    bws.send(JSON.stringify({
      type: "new-viewer",
      viewerId: id,
      monitor_number: monitor,
    }));

    ws.send(JSON.stringify({
      type: "viewer-joined",
      monitor_number: monitor,
      broadcaster_name: name,
    }));
  }
}

module.exports = { registerViewer, handleWatch, relayMessage, registerBroadcaster, handleDisconnect };
