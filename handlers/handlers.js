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
    peer.name = msg.broadcaster_name || msg.computer_name || `Broadcaster ${id.slice(0, 6)}`;
    peer.company_id = msg.company_id || "-1";

    let db_id = null;
    let installation_id = null;
    let broadcaster_group_name = null;
    
    if (process.env.DATABASE_URL) {
        try {
            const db = require('../database/db');
            const broadcasterService = require('../services/broadcasterService');
            
            if (msg.broadcaster_token) {
                const installationJwt = await broadcasterService.getInstallationByJwt(msg.broadcaster_token);
                
                if (installationJwt) {
                    db_id = installationJwt.broadcaster_id;
                    installation_id = installationJwt.id;
                    broadcaster_group_name = installationJwt.broadcaster_name;
                    peer.name = installationJwt.computer_name;
                    
                    await broadcasterService.updateInstallationConnection(installation_id);
                    
                    ws.send(JSON.stringify({
                        type: "auth-success",
                        broadcaster_id: db_id,
                        installation_id: installation_id,
                        broadcaster_group_name: broadcaster_group_name,
                        computer_name: peer.name,
                        message: `Reconexão bem-sucedida! Grupo: ${broadcaster_group_name}, Computer: ${peer.name}`
                    }));
                    
                    console.log(`✅ Installation ${installation_id} reconectada ao broadcaster group ${db_id} (${broadcaster_group_name}) - Computer: ${peer.name}`);
                    
                } else {
                    const broadcasterGroup = await broadcasterService.getBroadcasterByInstallationToken(msg.broadcaster_token);
                    
                    if (broadcasterGroup) {
                        db_id = broadcasterGroup.id;
                        broadcaster_group_name = broadcasterGroup.name;
                        
                        const computerName = msg.computer_name || peer.name;
                        
                        const installation = await broadcasterService.createInstallation(
                            db_id,
                            computerName,
                            msg.broadcaster_token
                        );
                        
                        installation_id = installation.id;
                        peer.name = computerName;
                        
                        ws.send(JSON.stringify({
                            type: "auth-success",
                            broadcaster_id: db_id,
                            installation_id: installation_id,
                            broadcaster_group_name: broadcaster_group_name,
                            computer_name: computerName,
                            token: installation.jwt_token,
                            token_expires_at: installation.jwt_expires_at,
                            message: `Installation registrada com sucesso! Grupo: ${broadcaster_group_name}, Computer: ${computerName}`
                        }));
                        
                        console.log(`🆕 Nova installation ${installation_id} criada para broadcaster group ${db_id} (${broadcaster_group_name}) - Computer: ${computerName}`);
                        
                    } else {
                        console.warn(`⚠️ Token de instalação inválido ou expirado`);
                        ws.close(4004, "Token de instalação inválido ou expirado");
                        return;
                    }
                }
            } else {
                console.warn(`⚠️ Broadcaster conectou sem token - conexão recusada`);
                ws.close(4003, "Token de autenticação é obrigatório");
                return;
            }
        } catch (err) {
            console.error('Erro ao processar broadcaster no banco:', err);
            ws.close(4005, "Erro ao processar autenticação");
            return;
        }
    }

    broadcasters.set(id, {
        ws,
        monitor_number: msg.monitor_number,
        name: peer.name,
        company_id: peer.company_id,
        db_id: db_id,
        installation_id: installation_id,
        broadcaster_group_name: broadcaster_group_name
    });

    console.log(`✅ Broadcaster conectado: ${peer.name} do grupo "${broadcaster_group_name}" (Monitor ${msg.monitor_number}, Group ID: ${db_id}, Installation ID: ${installation_id})`);

    if (db_id && process.env.DATABASE_URL) {
        const broadcasterService = require('../services/broadcasterService');
        
        for (const [, vpeer] of peers) {
            if (vpeer.role === "viewer" && vpeer.ws.readyState === WebSocket.OPEN) {
                const viewerId = vpeer.ws.user?.id;
                if (viewerId) {
                    try {
                        const hasPermission = await broadcasterService.hasViewerPermission(db_id, viewerId);
                        if (hasPermission) {
                            vpeer.ws.send(JSON.stringify({
                                type: "new-broadcaster",
                                broadcasterId: id,
                                broadcaster_name: broadcaster_group_name || peer.name,
                                computer_name: peer.name,
                                db_id: db_id,
                                installation_id: installation_id
                            }));
                            console.log(`📡 Notificado viewer ${viewerId} sobre novo broadcaster ${db_id}`);
                        }
                    } catch (err) {
                        console.error(`Erro ao verificar permissão do viewer ${viewerId}:`, err);
                    }
                }
            }
        }
    }
}
async function registerViewer(ws, id, peers, broadcasters) {
    console.log("📡 registerViewer chamado para:", id);
    const peer = peers.get(id);
    peer.role = "viewer";
    
    const viewerId = ws.user?.id;
    if (!viewerId) {
        console.log("⚠️ Viewer sem ID autenticado");
        ws.send(JSON.stringify({
            type: "broadcaster-list",
            broadcasters: [],
        }));
        return;
    }
    
    let permittedBroadcasters = [];
    
    if (process.env.DATABASE_URL) {
        try {
            const broadcasterService = require('../services/broadcasterService');
            const permissions = await broadcasterService.getViewerPermissions(viewerId);
            const permittedBroadcasterIds = permissions.map(p => p.broadcaster_id);
            console.log(`🔐 Viewer ${viewerId} tem permissão para ${permittedBroadcasterIds.length} broadcasters: [${permittedBroadcasterIds.join(', ')}]`);
            
            const allBroadcastersFromDb = await broadcasterService.getBroadcastersByIds(permittedBroadcasterIds);
            
            const onlineBroadcasterDbIds = new Set();
            const onlineBroadcasterMap = new Map();
            for (const [bid, bdata] of broadcasters.entries()) {
                if (permittedBroadcasterIds.includes(bdata.db_id)) {
                    onlineBroadcasterDbIds.add(bdata.db_id);
                    onlineBroadcasterMap.set(bdata.db_id, { wsId: bid, bdata });
                }
            }
            
            permittedBroadcasters = allBroadcastersFromDb.map(b => {
                const isOnline = onlineBroadcasterDbIds.has(b.id);
                const onlineData = onlineBroadcasterMap.get(b.id);
                return {
                    id: isOnline ? onlineData.wsId : null,
                    name: b.name,
                    db_id: b.id,
                    online: isOnline,
                    is_active: b.is_active
                };
            });
            
        } catch (err) {
            console.error('Erro ao buscar permissões do viewer:', err);
        }
    }
    
    permittedBroadcasters.sort((a, b) => {
        if (a.online !== b.online) return b.online - a.online;
        return a.name.localeCompare(b.name);
    });

    ws.send(JSON.stringify({
        type: "broadcaster-list",
        broadcasters: permittedBroadcasters,
    }));
}
async function handleDisconnect(ws, id, peers, broadcasters, deletePeer) {
    const peer = peers.get(id);
    if (!peer) return;

    console.log(`❌ Peer desconectado: ${id} (${peer.role})`);

    if (peer.role === "broadcaster") {
        const broadcasterData = broadcasters.get(id);
        const db_id = broadcasterData?.db_id;
        
        broadcasters.delete(id);

        if (db_id && process.env.DATABASE_URL) {
            const broadcasterService = require('../services/broadcasterService');
            
            for (const [, vpeer] of peers) {
                if (vpeer.role === "viewer" && vpeer.ws.readyState === ws.OPEN) {
                    const viewerId = vpeer.ws.user?.id;
                    if (viewerId) {
                        try {
                            const hasPermission = await broadcasterService.hasViewerPermission(db_id, viewerId);
                            if (hasPermission) {
                                vpeer.ws.send(JSON.stringify({
                                    type: "broadcaster-left",
                                    broadcasterId: id,
                                }));
                            }
                        } catch (err) {
                            console.error(`Erro ao verificar permissão do viewer ${viewerId}:`, err);
                        }
                    }
                }
            }
        } else {
            for (const [, vpeer] of peers) {
                if (vpeer.role === "viewer" && vpeer.ws.readyState === ws.OPEN) {
                    vpeer.ws.send(JSON.stringify({
                        type: "broadcaster-left",
                        broadcasterId: id,
                    }));
                }
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
async function handleWatch(ws, id, msg, peers, broadcasters) {
    const broadcasterId = msg.targetId;
    const monitor = msg.monitor_number || 1;

    if (!broadcasters.has(broadcasterId)) return;
    const broadcasterData = broadcasters.get(broadcasterId);
    const { ws: bws, name, db_id } = broadcasterData;
    
    const viewerId = ws.user?.id;
    if (viewerId && db_id && process.env.DATABASE_URL) {
        try {
            const broadcasterService = require('../services/broadcasterService');
            const hasPermission = await broadcasterService.hasViewerPermission(db_id, viewerId);
            if (!hasPermission) {
                console.log(`🚫 Viewer ${viewerId} tentou assistir broadcaster ${db_id} sem permissão`);
                ws.send(JSON.stringify({
                    type: "error",
                    message: "Você não tem permissão para assistir este broadcaster"
                }));
                return;
            }
        } catch (err) {
            console.error('Erro ao verificar permissão:', err);
        }
    }

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
        const installationId = broadcaster.installation_id;
        
        if (!broadcasterDbId) {
            console.warn(`⚠️ Broadcaster ${broadcasterId} sem db_id - dados de monitoramento não serão salvos. Certifique-se de que o broadcaster enviou o token correto.`);
            return;
        }
        
        try {
            await databaseStorage.saveActivity(broadcasterDbId, {
                installation_id: installationId,
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
                await databaseStorage.saveBrowserHistory(broadcasterDbId, installationId, msg.browser_history);
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
                    computer_name: broadcaster.name,
                    broadcaster_group: broadcaster.broadcaster_group_name,
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

async function handleTokenRenewal(ws, broadcasterId, broadcasters) {
    const broadcaster = broadcasters.get(broadcasterId);
    if (!broadcaster || !broadcaster.db_id) {
        console.warn(`⚠️ Tentativa de renovação de token para broadcaster inválido: ${broadcasterId}`);
        return;
    }

    try {
        const db = require('../database/db');
        const { generateToken } = require('../jwt/jwtUtils');
        
        const result = await db.query('SELECT owner_id FROM broadcasters WHERE id = $1', [broadcaster.db_id]);
        if (result.rows.length === 0) {
            console.warn(`⚠️ Broadcaster ${broadcaster.db_id} não encontrado no banco para renovação`);
            return;
        }
        
        const ownerId = result.rows[0].owner_id;
        const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
        
        const newToken = generateToken({ 
            type: 'broadcaster', 
            ownerId: ownerId, 
            broadcasterId: broadcaster.db_id 
        }, '60d');
        
        await db.query(
            'UPDATE broadcasters SET token = $1, token_expires_at = $2 WHERE id = $3',
            [newToken, tokenExpiresAt, broadcaster.db_id]
        );
        
        ws.send(JSON.stringify({
            type: "token-renewed",
            broadcaster_id: broadcaster.db_id,
            token: newToken,
            token_expires_at: tokenExpiresAt.toISOString(),
            message: "Token renovado com sucesso! Configuração atualizada."
        }));
        
        console.log(`🔄 Token renovado para broadcaster ${broadcaster.db_id} (${broadcaster.name})`);
        
    } catch (err) {
        console.error('Erro ao renovar token:', err);
        ws.send(JSON.stringify({
            type: "error",
            message: "Erro ao renovar token. Tente novamente mais tarde."
        }));
    }
}

module.exports = { 
    registerViewer,
    handleWatch,
    relayMessage,
    registerBroadcaster,
    handleDisconnect,
    handleClientData,
    handleMonitoring,
    handleTokenRenewal
};
