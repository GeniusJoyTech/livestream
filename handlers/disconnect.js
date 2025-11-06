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

module.exports = { handleDisconnect };
