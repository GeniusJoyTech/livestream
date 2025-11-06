const WebSocket = require("ws");
const { peers, broadcasters, createPeer, deletePeer } = require("./services/peers");
const { registerBroadcaster } = require("./handlers/broadcaster");
const { registerViewer, handleWatch } = require("./handlers/viewer");
const { relayMessage } = require("./handlers/relay");
const { handleDisconnect } = require("./handlers/disconnect");

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    const id = createPeer(ws);
    console.log(`🔗 Novo peer conectado: ${id}`);

    ws.on("message", (message) => {
      let msg;
      try { msg = JSON.parse(message); } 
      catch { console.error("Mensagem inválida:", message); return; }

      switch(msg.type) {
        case "broadcaster": registerBroadcaster(ws, id, msg, peers, broadcasters); break;
        case "viewer": registerViewer(ws, id, peers, broadcasters); break;
        case "watch": handleWatch(ws, id, msg, peers, broadcasters); break;
        case "offer": case "answer": case "candidate": relayMessage(id, msg, peers); break;
      }
    });

    ws.on("close", () => handleDisconnect(ws, id, peers, broadcasters, deletePeer));
  });
}

module.exports = { setupWebSocket };
