const { v4: uuidv4 } = require("uuid");

const peers = new Map();
const broadcasters = new Map();

function createPeer(ws) {
  const id = uuidv4();
  peers.set(id, { ws, role: null, monitor_number: null, name: null });
  return id;
}

function deletePeer(id) {
  peers.delete(id);
  broadcasters.delete(id);
}

module.exports = { peers, broadcasters, createPeer, deletePeer };
