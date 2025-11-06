const WebSocket = require("ws");

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

module.exports = { registerViewer, handleWatch };
