document.addEventListener("DOMContentLoaded", () => {
  const connectButton = document.getElementById('connectButton');
  const disconnectButton = document.getElementById('disconnectButton');
  const reconnectButton = document.getElementById('reconnectButton');
  const watchButton = document.getElementById('watchButton');
  const fullscreenButton = document.getElementById('fullscreenButton');
  const broadcasterSelect = document.getElementById('broadcasterSelect');
  const monitorSelect = document.getElementById('monitorSelect');
  const remoteVideo = document.getElementById('remoteVideo');
  const statusDiv = document.getElementById('status');
  const statsDiv = document.getElementById('stats');
  const logoutButton = document.getElementById('logoutButton');

  let socket;
  let peers = new Map();
  let selectedBroadcasterId = null;
  let selectedBroadcasterDbId = null;
  let selectedMonitorNumber = null;
  let broadcasters = [];
  let statsInterval = null;
  let shouldReconnect = true;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  const MAX_RECONNECT_DELAY = 30000;

  // ===========================
  // Verificação do token
  // ===========================
  const token = localStorage.getItem("token");
  if (!token) {
    alert("⚠️ Você precisa estar logado!");
    window.location.href = "/login/login.html";
    return;
  } else {
    logoutButton.disabled = false;
  }

  logoutButton.addEventListener("click", () => {
    shouldReconnect = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    localStorage.removeItem("token");
    logoutButton.disabled = true;
    remoteVideo.srcObject = null;
    setStatus("🔴 Desconectado", "#f00");
    if (socket) socket.close();
    window.location.href = "/login/login.html";
  });

  // ===========================
  // Função para atualizar status
  // ===========================
  function setStatus(msg, color = "#0f0") {
    statusDiv.style.color = color;
    statusDiv.textContent = msg;
  }

  // ===========================
  // Função para atualizar tabela de monitoramento
  // ===========================
  function updateMonitoringTable(data) {
    const monitoringInfo = document.getElementById('monitoring-info');
    const tbody = document.getElementById('monitoring-tbody');
    
    if (!data || !data.apps || data.apps.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhum dado disponível</td></tr>';
      monitoringInfo.innerHTML = '<p>Aguardando dados de monitoramento...</p>';
      return;
    }

    const timestamp = new Date(data.timestamp).toLocaleTimeString('pt-BR');
    monitoringInfo.innerHTML = `
      <p><strong>Host:</strong> ${data.host} | <strong>Sistema:</strong> ${data.system} | <strong>Última atualização:</strong> ${timestamp}</p>
    `;

    tbody.innerHTML = '';
    
    data.apps.forEach(app => {
      const row = tbody.insertRow();
      const isForeground = data.foreground && data.foreground.pid === app.pid;
      
      const statusCell = row.insertCell(0);
      statusCell.innerHTML = isForeground ? '🟢 Foco' : '⚪ Background';
      if (isForeground) {
        row.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
        row.style.fontWeight = 'bold';
      }
      
      const appCell = row.insertCell(1);
      appCell.textContent = app.app || '-';
      
      const titleCell = row.insertCell(2);
      titleCell.textContent = app.title || '-';
      
      const pidCell = row.insertCell(3);
      pidCell.textContent = app.pid || '-';
    });
  }

  // ===========================
  // Atualizar lista de broadcasters
  // ===========================
  function updateSelect() {
    broadcasterSelect.innerHTML = '';
    if (broadcasters.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'Nenhum broadcaster disponível';
      opt.disabled = true;
      broadcasterSelect.appendChild(opt);
      return;
    }
    broadcasters.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.setAttribute('data-db-id', b.db_id || '');
      opt.textContent = b.name;
      broadcasterSelect.appendChild(opt);
    });
  }

  // ===========================
  // Criar conexão WebRTC
  // ===========================
  function createPeerConnection(id, monitor_number) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

    pc.onicecandidate = (event) => {
      if (event.candidate && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate, targetId: id }));
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideo.srcObject !== event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.play().catch(err => console.warn("Erro ao iniciar vídeo:", err));
        setStatus("🎥 Recebendo vídeo...", "#0f0");
        startStats(pc);
      }
    };

    return pc;
  }

  // ===========================
  // Estatísticas
  // ===========================
  function startStats(pc) {
    clearInterval(statsInterval);
    statsInterval = setInterval(async () => {
      const stats = await pc.getStats();
      let info = "";
      stats.forEach(report => {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          info += `🧩 <b>Codec:</b> ${report.codecId || "?"}<br>`;
          info += `📦 <b>Pacotes:</b> ${report.packetsReceived}<br>`;
          info += `📊 <b>Bitrate:</b> ${(report.bytesReceived/1024).toFixed(1)} KB<br>`;
          info += `🎞️ <b>Frames:</b> ${report.framesDecoded || "?"}<br>`;
          info += `⚡ <b>FPS:</b> ${report.framesPerSecond || "?"}<br>`;
        }
        if (report.type === "track" && report.frameWidth) {
          info += `🖥️ <b>Resolução:</b> ${report.frameWidth}x${report.frameHeight}<br>`;
        }
        if (report.type === "codec" && report.mimeType) {
          info += `🎬 <b>Formato:</b> ${report.mimeType}<br>`;
        }
      });
      statsDiv.innerHTML = info || "📊 Nenhuma estatística disponível.";
    }, 1500);
  }

  // ===========================
  // Conectar WebSocket
  // ===========================
  async function connect() {
    setStatus("🔌 Conectando ao servidor...", "#ff0");
    connectButton.disabled = true;
    connectButton.textContent = "Conectando...";

    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${wsProtocol}//${location.host}?role=viewer&token=${token}`);

        socket.onopen = () => {
      console.log("✅ WebSocket conectado");
      reconnectAttempts = 0;
      shouldReconnect = true;
      setStatus("✅ Conectado ao servidor de sinalização", "#0f0");
      connectButton.style.display = "none";
      disconnectButton.disabled = false;
      reconnectButton.disabled = true;
      socket.send(JSON.stringify({ type: "viewer" }));
    };

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "broadcaster-list":
          broadcasters = message.broadcasters || [];
          updateSelect();
          break;
        case "new-broadcaster":
          broadcasters.push({
            id: message.broadcasterId,
            name: message.broadcaster_name || `Broadcaster ${message.broadcasterId.slice(0,6)}`,
            db_id: message.db_id
          });
          updateSelect();
          break;
        case "broadcaster-left":
          broadcasters = broadcasters.filter(b => b.id !== message.broadcasterId);
          updateSelect();
          if (selectedBroadcasterId === message.broadcasterId) {
            remoteVideo.srcObject = null;
            setStatus("❌ Broadcaster saiu", "#f00");
            selectedBroadcasterId = null;
          }
          break;
        case "offer":
          const pc = createPeerConnection(message.senderId, message.monitor_number);
          peers.set(message.senderId, pc);
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.send(JSON.stringify({
            type: "answer",
            sdp: pc.localDescription,
            targetId: message.senderId
          }));
          setStatus("📡 Conectado ao broadcaster", "#0f0");
          break;
        case "candidate":
          const candidatePc = peers.get(message.senderId);
          if (candidatePc) await candidatePc.addIceCandidate(new RTCIceCandidate(message.candidate));
          break;
        case "monitoring":
          if (message.broadcasterId === selectedBroadcasterId) {
            updateMonitoringTable(message.data);
          }
          break;
      }
    };

    socket.onclose = () => {
      console.warn("⚠️ WebSocket desconectado");
      
      if (shouldReconnect) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
        setStatus(`⚠️ Desconectado. Reconectando em ${(delay/1000).toFixed(0)}s... (tentativa ${reconnectAttempts})`, "#ff0");
        
        reconnectTimer = setTimeout(() => {
          console.log(`🔄 Tentando reconectar (tentativa ${reconnectAttempts})...`);
          connect();
        }, delay);
      } else {
        setStatus("⚠️ Desconectado do servidor", "#f00");
        disconnectButton.disabled = true;
        reconnectButton.disabled = false;
      }
    };
    
    socket.onerror = (error) => {
      console.error("❌ Erro no WebSocket:", error);
    };
  }

  connectButton.onclick = connect;

  disconnectButton.onclick = () => {
    shouldReconnect = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    peers.forEach(pc => pc.close());
    peers.clear();
    if (socket) socket.close();
    remoteVideo.srcObject = null;
    clearInterval(statsInterval);
    statsDiv.textContent = "📊 Nenhuma estatística disponível.";
    setStatus("🔴 Desconectado", "#f00");
    disconnectButton.disabled = true;
    reconnectButton.disabled = false;
  };

  reconnectButton.onclick = connect;

  watchButton.onclick = () => {
    selectedBroadcasterId = broadcasterSelect.value;
    const selectedOption = broadcasterSelect.options[broadcasterSelect.selectedIndex];
    selectedBroadcasterDbId = selectedOption ? selectedOption.getAttribute('data-db-id') : null;
    selectedMonitorNumber = monitorSelect.value;
    if (!selectedBroadcasterId || !socket || socket.readyState !== WebSocket.OPEN) return;

    setStatus("🎬 Solicitando transmissão...", "#ff0");

    socket.send(JSON.stringify({
      type: "watch",
      targetId: selectedBroadcasterId,
      monitor_number: selectedMonitorNumber
    }));
  };

  fullscreenButton.onclick = () => {
    if (remoteVideo.requestFullscreen) remoteVideo.requestFullscreen();
  };

  // ===========================
  // Exportação Excel
  // ===========================
  const exportButton = document.getElementById('exportButton');
  const fromDateInput = document.getElementById('fromDate');
  const toDateInput = document.getElementById('toDate');
  const exportStatus = document.getElementById('export-status');

  const today = new Date().toISOString().split('T')[0];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  fromDateInput.value = oneWeekAgo;
  toDateInput.value = today;

  watchButton.addEventListener('click', () => {
    if (selectedBroadcasterId) {
      exportButton.disabled = false;
    }
  });

  exportButton.onclick = async () => {
    if (!selectedBroadcasterId) {
      exportStatus.textContent = '⚠️ Selecione um broadcaster e clique em "Assistir" primeiro';
      exportStatus.style.color = '#ff0';
      return;
    }
    
    if (!selectedBroadcasterDbId) {
      exportStatus.textContent = '⚠️ Este broadcaster não está configurado corretamente. Entre em contato com o administrador.';
      exportStatus.style.color = '#ff0';
      console.error('Broadcaster sem db_id - verifique se o broadcaster está usando token válido');
      return;
    }

    const from = fromDateInput.value;
    const to = toDateInput.value;

    if (!from || !to) {
      exportStatus.textContent = '⚠️ Selecione as datas';
      exportStatus.style.color = '#ff0';
      return;
    }

    exportButton.disabled = true;
    exportStatus.textContent = '⏳ Gerando relatório...';
    exportStatus.style.color = '#ff0';

    try {
      const url = `/api/reports/export/excel?broadcasterId=${selectedBroadcasterDbId}&fromDate=${from}&toDate=${to}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao gerar relatório');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `relatorio_${selectedBroadcasterDbId}_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      exportStatus.textContent = '✅ Relatório baixado com sucesso!';
      exportStatus.style.color = '#0f0';
    } catch (error) {
      console.error('Erro ao exportar:', error);
      exportStatus.textContent = `❌ ${error.message}`;
      exportStatus.style.color = '#f00';
    } finally {
      exportButton.disabled = false;
    }
  };
});
