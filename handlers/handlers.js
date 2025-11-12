const WebSocket = require("ws");
/*
    registerBroadcaster: cadastra um broadcaster e avisa os viewers.
    registerViewer: cadastra um viewer e envia lista de broadcasters.
    handleDisconnect: remove peers desconectados e avisa viewers se broadcaster sair.
    relayMessage: envia mensagens P2P entre peers.
    handleWatch: conecta um viewer a um broadcaster específico.
*/
function registerBroadcaster(ws, id, msg, peers, broadcasters) {//egistra um usuário como broadcaster (quem transmite vídeo ou monitor)
    const peer = peers.get(id);
    peer.role = "broadcaster";
    peer.monitor_number = msg.monitor_number;
    peer.name = msg.broadcaster_name || `Broadcaster ${id.slice(0, 6)}`;
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
function registerViewer(ws, id, peers, broadcasters) {//Registra um usuário como viewer (quem assiste à transmissão).
    console.log("📡 registerViewer chamado para:", id);
    const peer = peers.get(id);
    peer.role = "viewer";
    const activeBroadcasters = [...broadcasters.entries()]
        // .filter(([bid, bdata]) => bdata.company_id === "1")
        .map(([bid, bdata]) => {
            const obj = { id: bid, name: bdata.name, company_id: bdata.company_id };
            console.log("Itens filtrados: ", obj); // loga cada um encontrado
            return obj;
        })
        .sort((a, b) => a.name.localeCompare(b.name)); // ordena alfabeticamente pelo name

    ws.send(JSON.stringify({
        type: "broadcaster-list",
        broadcasters: activeBroadcasters,
    }));
}
function handleDisconnect(ws, id, peers, broadcasters, deletePeer) {//Trata quando um peer (broadcaster ou viewer) desconecta.
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
function relayMessage(id, msg, peers) {//relayMessage(id, msg, peers)
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

//Relatórios:
function handleClientData(ws, id, msg, peers) {
    const peer = peers.get(id);
    if (!peer) return;

    // Atualiza os dados do peer
    peer.name = msg.host || peer.name;                  // nome do computador
    peer.monitor_number = msg.eventos?.map(e => e.monitor) || peer.monitor_number;
    peer.eventos = msg.eventos || [];
    peer.desempenho = msg.desempenho || {};
    peer.timestamp = msg.timestamp || new Date().toISOString();

    console.log(`📊 Dados recebidos de ${peer.name} (${id}):`);
    console.log(JSON.stringify(msg, null, 2));

    // Aqui você poderia salvar em um banco de dados, se quiser
}

module.exports = { 
    registerViewer,
    handleWatch,
    relayMessage,
    registerBroadcaster,
    handleDisconnect,
    handleClientData  // <-- novo handler exportado
};
