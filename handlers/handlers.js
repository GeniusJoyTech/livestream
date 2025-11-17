const WebSocket = require("ws");
/*
    registerBroadcaster: cadastra um broadcaster e avisa os viewers.
    registerViewer: cadastra um viewer e envia lista de broadcasters.
    handleDisconnect: remove peers desconectados e avisa viewers se broadcaster sair.
    relayMessage: envia mensagens P2P entre peers.
    handleWatch: conecta um viewer a um broadcaster específico.
*/
async function registerBroadcaster(ws, id, msg, peers, broadcasters) {
    const peer = peers.get(id);
    peer.role = "broadcaster";
    peer.monitor_number = msg.monitor_number;
    peer.name = msg.broadcaster_name || `Broadcaster ${id.slice(0, 6)}`;
    peer.company_id = msg.company_id || "-1";

    let db_id = null;
    let isInstallationToken = false;
    
    if (process.env.DATABASE_URL && msg.broadcaster_token) {
        try {
            const db = require('../database/db');
            
            const result = await db.query(
                'SELECT id, token, token_expires_at, installation_token FROM broadcasters WHERE token = $1 OR installation_token = $1',
                [msg.broadcaster_token]
            );
            
            if (result.rows.length > 0) {
                const broadcaster = result.rows[0];
                db_id = broadcaster.id;
                isInstallationToken = (broadcaster.installation_token === msg.broadcaster_token);
                
                await db.query(
                    'UPDATE broadcasters SET last_connected_at = CURRENT_TIMESTAMP, name = $2 WHERE id = $1',
                    [db_id, peer.name]
                );
                
                console.log(`✅ Broadcaster ${db_id} autenticado (${isInstallationToken ? 'installation_token' : 'permanent_token'})`);
                
                if (isInstallationToken) {
                    ws.send(JSON.stringify({
                        type: "auth-success",
                        broadcaster_id: db_id,
                        token: broadcaster.token,
                        token_expires_at: broadcaster.token_expires_at,
                        message: "Broadcaster instalado com sucesso! Configuração salva localmente."
                    }));
                    console.log(`🔑 Token permanente enviado ao broadcaster ${db_id}`);
                }
            } else {
                console.warn(`⚠️ Broadcaster com token não encontrado no banco`);
            }
        } catch (err) {
            console.error('Erro ao buscar broadcaster no banco:', err);
        }
    }

    broadcasters.set(id, {
        ws,
        monitor_number: msg.monitor_number,
        name: peer.name,
        company_id: peer.company_id,
        db_id: db_id,
    });

    console.log(`✅ Broadcaster conectado: ${peer.name} (Monitor ${msg.monitor_number}, DB ID: ${db_id})`);

    for (const [, vpeer] of peers) {
        if (vpeer.role === "viewer" && vpeer.ws.readyState === WebSocket.OPEN) {
            vpeer.ws.send(JSON.stringify({
                type: "new-broadcaster",
                broadcasterId: id,
                broadcaster_name: peer.name,
                db_id: db_id,
            }));
        }
    }
}
function registerViewer(ws, id, peers, broadcasters) {
    console.log("📡 registerViewer chamado para:", id);
    const peer = peers.get(id);
    peer.role = "viewer";
    const activeBroadcasters = [...broadcasters.entries()]
        .map(([bid, bdata]) => {
            const obj = { 
                id: bid, 
                name: bdata.name, 
                company_id: bdata.company_id,
                db_id: bdata.db_id
            };
            console.log("Itens filtrados: ", obj);
            return obj;
        })
        .sort((a, b) => a.name.localeCompare(b.name));

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

    const viewer = peers.get(id);
    if (viewer) {
        viewer.watchingBroadcaster = broadcasterId;
    }

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

async function handleMonitoring(broadcasterId, msg, peers, broadcasters) {
    console.log(`📊 Monitoramento recebido de broadcaster ${broadcasterId}`);
    const broadcaster = broadcasters.get(broadcasterId);
    if (!broadcaster) {
        console.log(`⚠️ Broadcaster ${broadcasterId} não encontrado`);
        return;
    }

    if (process.env.DATABASE_URL) {
        const databaseStorage = require('../services/databaseStorage');
        const broadcasterDbId = broadcaster.db_id;
        
        if (!broadcasterDbId) {
            console.warn(`⚠️ Broadcaster ${broadcasterId} sem db_id - dados de monitoramento não serão salvos. Certifique-se de que o broadcaster enviou o token correto.`);
            return;
        }
        
        try {
            await databaseStorage.saveActivity(broadcasterDbId, {
                idle_seconds: parseInt(msg.idle_seconds) || 0,
                active_url: msg.active_url,
                foreground_app: msg.foreground?.app,
                app_count: msg.apps ? msg.apps.length : 0,
                apps: msg.apps
            });
        } catch (err) {
            console.error('Erro ao salvar atividade no banco:', err);
        }

        if (msg.browser_history && msg.browser_history.length > 0) {
            console.log(`📚 Salvando ${msg.browser_history.length} entradas de histórico de navegação`);
            try {
                await databaseStorage.saveBrowserHistory(broadcasterDbId, msg.browser_history);
            } catch (err) {
                console.error('Erro ao salvar histórico de navegação no banco:', err);
            }
        }
    } else {
        const { addActivity, addBrowserHistory } = require('../services/activityStorage');
        addActivity(broadcasterId, msg).catch(err => {
            console.error('Erro ao salvar atividade:', err);
        });

        if (msg.browser_history && msg.browser_history.length > 0) {
            console.log(`📚 Salvando ${msg.browser_history.length} entradas de histórico de navegação`);
            addBrowserHistory(broadcasterId, msg.browser_history).catch(err => {
                console.error('Erro ao salvar histórico de navegação:', err);
            });
        }
    }

    let viewersNotified = 0;
    for (const [viewerId, vpeer] of peers) {
        if (vpeer.role === "viewer" && 
            vpeer.watchingBroadcaster === broadcasterId && 
            vpeer.ws.readyState === WebSocket.OPEN) {
            vpeer.ws.send(JSON.stringify({
                type: "monitoring",
                broadcasterId: broadcasterId,
                data: {
                    timestamp: msg.timestamp,
                    host: msg.host,
                    apps: msg.apps,
                    foreground: msg.foreground,
                    system: msg.system,
                    idle_seconds: msg.idle_seconds,
                    is_idle: msg.is_idle,
                    active_url: msg.active_url
                }
            }));
            viewersNotified++;
        }
    }
    console.log(`✅ Dados enviados para ${viewersNotified} viewer(s)`);
}

module.exports = { 
    registerViewer,
    handleWatch,
    relayMessage,
    registerBroadcaster,
    handleDisconnect,
    handleClientData,
    handleMonitoring
};
