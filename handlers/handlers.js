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
    
    let permittedBroadcasterIds = [];
    
    if (process.env.DATABASE_URL) {
        try {
            const broadcasterService = require('../services/broadcasterService');
            const permissions = await broadcasterService.getViewerPermissions(viewerId);
            permittedBroadcasterIds = permissions.map(p => p.broadcaster_id);
            console.log(`🔐 Viewer ${viewerId} tem permissão para ${permittedBroadcasterIds.length} broadcasters: [${permittedBroadcasterIds.join(', ')}]`);
        } catch (err) {
            console.error('Erro ao buscar permissões do viewer:', err);
        }
    }
    
    const activeBroadcasters = [...broadcasters.entries()]
        .filter(([, bdata]) => permittedBroadcasterIds.includes(bdata.db_id))
        .map(([bid, bdata]) => {
            const obj = { 
                id: bid, 
                name: bdata.name, 
                company_id: bdata.company_id,
                db_id: bdata.db_id
            };
            console.log("Broadcaster permitido para viewer: ", obj);
            return obj;
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    ws.send(JSON.stringify({
        type: "broadcaster-list",
        broadcasters: activeBroadcasters,
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
    } else if (peer.role === "viewer") {
        const watched = broadcasters.get(peer.watchingBroadcaster);
        if (watched?.ws.readyState === WebSocket.OPEN) {
            watched.ws.send(JSON.stringify({ type: "viewer-disconnected", viewerId: id }));
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

    if (!broadcasters.has(broadcasterId)) {
        ws.send(JSON.stringify({ type: "error", message: "Esta máquina desconectou. Aguarde ela aparecer novamente na lista." }));
        return;
    }
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
            ws.send(JSON.stringify({ type: "error", message: "Não foi possível verificar a permissão para assistir. Tente novamente." }));
            return;
        }
    }

    const viewer = peers.get(id);
    if (viewer) {
        const previous = broadcasters.get(viewer.watchingBroadcaster);
        if (previous?.ws.readyState === WebSocket.OPEN) {
            previous.ws.send(JSON.stringify({ type: "viewer-disconnected", viewerId: id }));
        }
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
    } else {
        ws.send(JSON.stringify({ type: "error", message: "A máquina está desconectada. Aguarde a reconexão." }));
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

// Limites para proteger a memória do servidor
const MAX_APPS_PER_MESSAGE = 300;
const MAX_HISTORY_PER_MESSAGE = 2000;
const MAX_PENDING_SAVES_PER_BROADCASTER = 3;
const pendingSaves = new Map(); // broadcasterId -> contagem de gravações em andamento

async function handleMonitoring(broadcasterId, msg, peers, broadcasters) {
    console.log(`📊 Monitoramento recebido de broadcaster ${broadcasterId}`);
    const broadcaster = broadcasters.get(broadcasterId);
    if (!broadcaster) {
        console.log(`⚠️ Broadcaster ${broadcasterId} não encontrado`);
        return;
    }

    // Trunca arrays absurdamente grandes para evitar estouro de memória
    if (Array.isArray(msg.apps) && msg.apps.length > MAX_APPS_PER_MESSAGE) {
        console.warn(`⚠️ Lista de apps truncada de ${msg.apps.length} para ${MAX_APPS_PER_MESSAGE} (broadcaster ${broadcasterId})`);
        msg.apps = msg.apps.slice(0, MAX_APPS_PER_MESSAGE);
    }
    if (Array.isArray(msg.browser_history) && msg.browser_history.length > MAX_HISTORY_PER_MESSAGE) {
        console.warn(`⚠️ Histórico truncado de ${msg.browser_history.length} para ${MAX_HISTORY_PER_MESSAGE} entradas (broadcaster ${broadcasterId})`);
        msg.browser_history = msg.browser_history.slice(0, MAX_HISTORY_PER_MESSAGE);
    }

    // Backpressure: se o banco não acompanha, descarta a gravação (dados de monitoramento são periódicos)
    const pending = pendingSaves.get(broadcasterId) || 0;
    const canSave = pending < MAX_PENDING_SAVES_PER_BROADCASTER;
    if (!canSave) {
        console.warn(`⚠️ ${pending} gravações pendentes para broadcaster ${broadcasterId} — descartando esta gravação (backpressure)`);
    }

    if (process.env.DATABASE_URL) {
        const databaseStorage = require('../services/databaseStorage');
        const broadcasterDbId = broadcaster.db_id;
        const installationId = broadcaster.installation_id;
        
        if (!broadcasterDbId) {
            console.warn(`⚠️ Broadcaster ${broadcasterId} sem db_id - dados de monitoramento não serão salvos. Certifique-se de que o broadcaster enviou o token correto.`);
            return;
        }
        
        if (canSave) {
            pendingSaves.set(broadcasterId, pending + 1);
            try {
                await databaseStorage.saveActivity(broadcasterDbId, {
                    installation_id: installationId,
                    idle_seconds: parseInt(msg.idle_seconds) || 0,
                    active_url: msg.active_url,
                    foreground_app: msg.foreground?.app,
                    app_count: msg.apps ? msg.apps.length : 0,
                    apps: msg.apps
                });

                if (msg.browser_history && msg.browser_history.length > 0) {
                    console.log(`📚 Salvando ${msg.browser_history.length} entradas de histórico de navegação`);
                    try {
                        await databaseStorage.saveBrowserHistory(broadcasterDbId, installationId, msg.browser_history);
                    } catch (err) {
                        console.error('Erro ao salvar histórico de navegação no banco:', err);
                    }
                }
            } catch (err) {
                console.error('Erro ao salvar atividade no banco:', err);
            } finally {
                const current = pendingSaves.get(broadcasterId) || 1;
                if (current <= 1) pendingSaves.delete(broadcasterId);
                else pendingSaves.set(broadcasterId, current - 1);
            }
        }
    } else if (canSave) {
        const { addActivity, addBrowserHistory } = require('../services/activityStorage');
        pendingSaves.set(broadcasterId, pending + 1);
        const decrement = () => {
            const current = pendingSaves.get(broadcasterId) || 1;
            if (current <= 1) pendingSaves.delete(broadcasterId);
            else pendingSaves.set(broadcasterId, current - 1);
        };
        const savePromises = [
            addActivity(broadcasterId, msg).catch(err => {
                console.error('Erro ao salvar atividade:', err);
            })
        ];
        if (msg.browser_history && msg.browser_history.length > 0) {
            console.log(`📚 Salvando ${msg.browser_history.length} entradas de histórico de navegação`);
            savePromises.push(addBrowserHistory(broadcasterId, msg.browser_history).catch(err => {
                console.error('Erro ao salvar histórico de navegação:', err);
            }));
        }
        Promise.all(savePromises).finally(decrement);
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

    if (!broadcaster.installation_id) {
        console.warn(`⚠️ Broadcaster ${broadcaster.db_id} não possui installation_id — não é possível renovar token`);
        ws.send(JSON.stringify({
            type: "error",
            message: "Renovação de token não disponível para esta conexão. Reconecte com um token de instalação válido."
        }));
        return;
    }

    try {
        const db = require('../database/db');
        const { generateToken } = require('../jwt/jwtUtils');
        
        // Fetch installation + broadcaster owner info
        const result = await db.query(
            `SELECT bi.id as installation_id, bi.computer_name, bi.broadcaster_id,
                    b.owner_id, b.name as broadcaster_name
             FROM broadcaster_installations bi
             INNER JOIN broadcasters b ON bi.broadcaster_id = b.id
             WHERE bi.id = $1 AND bi.is_active = true AND b.is_active = true`,
            [broadcaster.installation_id]
        );

        if (result.rows.length === 0) {
            console.warn(`⚠️ Installation ${broadcaster.installation_id} não encontrada ou inativa`);
            ws.send(JSON.stringify({
                type: "error",
                message: "Installation não encontrada. O token não pode ser renovado automaticamente."
            }));
            return;
        }
        
        const inst = result.rows[0];
        const jwtExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
        
        const newToken = generateToken({ 
            type: 'installation_jwt', 
            ownerId: inst.owner_id,
            broadcasterId: inst.broadcaster_id,
            computerName: inst.computer_name
        }, '60d');
        
        await db.query(
            `UPDATE broadcaster_installations 
             SET jwt_token = $1, jwt_expires_at = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [newToken, jwtExpiresAt, inst.installation_id]
        );
        
        ws.send(JSON.stringify({
            type: "token-renewed",
            broadcaster_id: inst.broadcaster_id,
            token: newToken,
            token_expires_at: jwtExpiresAt.toISOString(),
            message: "Token renovado com sucesso! Configuração atualizada."
        }));
        
        console.log(`🔄 Token renovado para installation ${inst.installation_id} (${inst.computer_name}) do broadcaster ${inst.broadcaster_id} (${inst.broadcaster_name})`);
        
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
