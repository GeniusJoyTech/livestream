function registerBroadcaster(ws, id, msg, peers, broadcasters) {
  const peer = peers.get(id);
  peer.role = "broadcaster";
  peer.monitor_number = msg.monitor_number;
  peer.name = msg.broadcaster_name || `Broadcaster ${id.slice(0,6)}`;

  broadcasters.set(id, {
    ws,
    monitor_number: msg.monitor_number,
    name: peer.name,
  });

  console.log(`✅ Broadcaster conectado: ${peer.name} (Monitor ${msg.monitor_number})`);

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

module.exports = { registerBroadcaster };
