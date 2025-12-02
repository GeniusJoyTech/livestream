document.addEventListener("DOMContentLoaded", () => {
  const connectButton = document.getElementById('connectButton');
  const disconnectButton = document.getElementById('disconnectButton');
  const reconnectButton = document.getElementById('reconnectButton');
  const watchButton = document.getElementById('watchButton');
  const fullscreenButton = document.getElementById('fullscreenButton');
  const broadcasterSelect = document.getElementById('broadcasterSelect');
  const broadcasterSearch = document.getElementById('broadcasterSearch');
  const monitorSelect = document.getElementById('monitorSelect');
  const remoteVideo = document.getElementById('remoteVideo');
  const statusDiv = document.getElementById('status');
  const statusDot = document.getElementById('statusDot');
  const statsDiv = document.getElementById('stats');
  const logoutButton = document.getElementById('logoutButton');
  const userInfo = document.getElementById('userInfo');
  const videoOverlay = document.getElementById('videoOverlay');

  let socket;
  let peers = new Map();
  let selectedBroadcasterId = null;
  let selectedBroadcasterDbId = null;
  let selectedMonitorNumber = null;
  let broadcasters = [];
  let allBroadcasters = [];
  let statsInterval = null;
  let shouldReconnect = true;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  const MAX_RECONNECT_DELAY = 30000;
  
  let appFocusTime = new Map();
  let appBackgroundTime = new Map();
  let lastUpdateTime = null;

  const token = localStorage.getItem("token");
  if (!token) {
    alert("Voce precisa estar logado!");
    window.location.href = "/login/login.html";
    return;
  }

  fetchUserInfo();

  async function fetchUserInfo() {
    try {
      const res = await fetch("/api/users/me", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        userInfo.textContent = data.username || data.email || "Usuario";
      }
    } catch (err) {
      console.error("Erro ao buscar info do usuario:", err);
    }
  }

  logoutButton.addEventListener("click", () => {
    shouldReconnect = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    localStorage.removeItem("token");
    remoteVideo.srcObject = null;
    setStatus("Desconectado", false);
    if (socket) socket.close();
    window.location.href = "/login/login.html";
  });

  function setStatus(msg, online = false) {
    statusDiv.textContent = msg;
    if (statusDot) {
      statusDot.className = online ? "status-dot online" : "status-dot offline";
    }
  }

  function formatDuration(seconds) {
    if (seconds < 60) {
      return `${Math.floor(seconds)}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }

  function updateMonitoringTable(data) {
    const monitoringInfo = document.getElementById('monitoring-info');
    const tbody = document.getElementById('monitoring-tbody');
    
    if (!data || !data.apps || data.apps.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhum dado disponivel</td></tr>';
      monitoringInfo.innerHTML = '<p>Aguardando dados de monitoramento...</p>';
      return;
    }

    const now = Date.now();
    if (lastUpdateTime) {
      const elapsed = (now - lastUpdateTime) / 1000;
      
      if (data.foreground) {
        const focusAppKey = data.foreground.app || 'unknown';
        const currentFocusTime = appFocusTime.get(focusAppKey) || 0;
        appFocusTime.set(focusAppKey, currentFocusTime + elapsed);
      }
      
      data.apps.forEach(app => {
        const appKey = app.app || 'unknown';
        const isForeground = data.foreground && data.foreground.pid === app.pid;
        
        if (!isForeground) {
          const currentBgTime = appBackgroundTime.get(appKey) || 0;
          appBackgroundTime.set(appKey, currentBgTime + elapsed);
        }
      });
    }
    lastUpdateTime = now;

    const timestamp = new Date(data.timestamp).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    monitoringInfo.innerHTML = `
      <p><strong>Host:</strong> ${data.host} | <strong>Sistema:</strong> ${data.system} | <strong>Ultima atualizacao:</strong> ${timestamp}</p>
    `;

    tbody.innerHTML = '';
    
    data.apps.forEach(app => {
      const row = tbody.insertRow();
      const isForeground = data.foreground && data.foreground.pid === app.pid;
      const appKey = app.app || 'unknown';
      
      const statusCell = row.insertCell(0);
      statusCell.innerHTML = isForeground ? '<span style="color: #28a745;">● Foco</span>' : '<span style="color: #666;">○ Background</span>';
      if (isForeground) {
        row.style.backgroundColor = 'rgba(40, 167, 69, 0.1)';
      }
      
      const appCell = row.insertCell(1);
      appCell.textContent = app.app || '-';
      
      const titleCell = row.insertCell(2);
      titleCell.textContent = app.title || '-';
      titleCell.style.maxWidth = '200px';
      titleCell.style.overflow = 'hidden';
      titleCell.style.textOverflow = 'ellipsis';
      titleCell.style.whiteSpace = 'nowrap';
      
      const focusTimeCell = row.insertCell(3);
      const focusSeconds = appFocusTime.get(appKey) || 0;
      focusTimeCell.textContent = focusSeconds > 0 ? formatDuration(focusSeconds) : '-';
      focusTimeCell.style.textAlign = 'center';
      
      const bgTimeCell = row.insertCell(4);
      const bgSeconds = appBackgroundTime.get(appKey) || 0;
      bgTimeCell.textContent = bgSeconds > 0 ? formatDuration(bgSeconds) : '-';
      bgTimeCell.style.textAlign = 'center';
      
      const pidCell = row.insertCell(5);
      pidCell.textContent = app.pid || '-';
    });
  }

  function filterBroadcasters(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
      broadcasters = [...allBroadcasters];
    } else {
      broadcasters = allBroadcasters.filter(b => 
        b.name.toLowerCase().includes(term)
      );
    }
    updateSelect();
  }

  function updateSelect() {
    broadcasterSelect.innerHTML = '';
    const hasActiveStream = remoteVideo.srcObject !== null;
    const activeInFullList = hasActiveStream && allBroadcasters.some(b => b.id === selectedBroadcasterId);
    
    if (broadcasters.length === 0) {
      const opt = document.createElement('option');
      
      if (allBroadcasters.length === 0) {
        opt.textContent = 'Nenhum broadcaster disponivel';
        opt.value = '';
        selectedBroadcasterId = null;
        selectedBroadcasterDbId = null;
        exportActivitiesButton.disabled = true;
        exportUrlsButton.disabled = true;
        watchButton.disabled = true;
      } else if (activeInFullList) {
        const activeBroadcaster = allBroadcasters.find(b => b.id === selectedBroadcasterId);
        opt.textContent = `Assistindo: ${activeBroadcaster?.name || 'Broadcaster'} (limpe a busca para ver opcoes)`;
        opt.value = selectedBroadcasterId;
        opt.setAttribute('data-db-id', selectedBroadcasterDbId || '');
        watchButton.disabled = true;
      } else {
        opt.textContent = 'Nenhum resultado encontrado';
        opt.value = '';
        selectedBroadcasterId = null;
        selectedBroadcasterDbId = null;
        exportActivitiesButton.disabled = true;
        exportUrlsButton.disabled = true;
        watchButton.disabled = true;
      }
      
      opt.disabled = true;
      opt.selected = true;
      broadcasterSelect.appendChild(opt);
      return;
    }
    
    let foundCurrent = false;
    broadcasters.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.setAttribute('data-db-id', b.db_id || '');
      opt.textContent = b.name;
      if (selectedBroadcasterId === b.id) {
        opt.selected = true;
        foundCurrent = true;
      }
      broadcasterSelect.appendChild(opt);
    });
    
    if (!foundCurrent && broadcasters.length > 0) {
      if (!hasActiveStream) {
        broadcasterSelect.selectedIndex = 0;
        const firstOption = broadcasterSelect.options[0];
        if (firstOption && firstOption.value) {
          selectedBroadcasterId = firstOption.value;
          selectedBroadcasterDbId = firstOption.getAttribute('data-db-id') || null;
        }
      } else {
        const placeholder = document.createElement('option');
        const activeBroadcaster = allBroadcasters.find(b => b.id === selectedBroadcasterId);
        placeholder.textContent = `Assistindo: ${activeBroadcaster?.name || 'Broadcaster'} (oculto)`;
        placeholder.value = selectedBroadcasterId;
        placeholder.setAttribute('data-db-id', selectedBroadcasterDbId || '');
        placeholder.selected = true;
        broadcasterSelect.insertBefore(placeholder, broadcasterSelect.firstChild);
      }
    }
    
    watchButton.disabled = false;
  }

  broadcasterSelect.addEventListener('change', () => {
    const selectedOption = broadcasterSelect.options[broadcasterSelect.selectedIndex];
    if (selectedOption && selectedOption.value) {
      selectedBroadcasterId = selectedOption.value;
      selectedBroadcasterDbId = selectedOption.getAttribute('data-db-id') || null;
    }
  });

  broadcasterSearch.addEventListener('input', (e) => {
    filterBroadcasters(e.target.value);
  });

  broadcasterSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (broadcasters.length > 0) {
        watchButton.click();
      }
    }
  });

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
        remoteVideo.play().catch(err => console.warn("Erro ao iniciar video:", err));
        setStatus("Recebendo video...", true);
        if (videoOverlay) videoOverlay.classList.add('hidden');
        startStats(pc);
      }
    };

    return pc;
  }

  function startStats(pc) {
    clearInterval(statsInterval);
    statsInterval = setInterval(async () => {
      const stats = await pc.getStats();
      let info = "";
      stats.forEach(report => {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          info += `Pacotes: ${report.packetsReceived} | `;
          info += `Bitrate: ${(report.bytesReceived/1024).toFixed(1)} KB | `;
          info += `FPS: ${report.framesPerSecond || "?"}`;
        }
      });
      statsDiv.textContent = info || "";
    }, 1500);
  }

  async function connect() {
    setStatus("Conectando ao servidor...", false);
    connectButton.disabled = true;

    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${wsProtocol}//${location.host}?role=viewer&token=${token}`);

    socket.onopen = () => {
      console.log("WebSocket conectado");
      reconnectAttempts = 0;
      shouldReconnect = true;
      setStatus("Conectado ao servidor", true);
      connectButton.style.display = "none";
      disconnectButton.disabled = false;
      reconnectButton.disabled = true;
      socket.send(JSON.stringify({ type: "viewer" }));
    };

    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "broadcaster-list":
          allBroadcasters = message.broadcasters || [];
          broadcasters = [...allBroadcasters];
          updateSelect();
          break;
        case "new-broadcaster":
          const newB = {
            id: message.broadcasterId,
            name: message.broadcaster_name || `Broadcaster ${message.broadcasterId.slice(0,6)}`,
            db_id: message.db_id
          };
          allBroadcasters.push(newB);
          filterBroadcasters(broadcasterSearch.value);
          break;
        case "broadcaster-left":
          const departingId = message.broadcasterId;
          const wasActiveStream = selectedBroadcasterId === departingId && remoteVideo.srcObject;
          
          allBroadcasters = allBroadcasters.filter(b => b.id !== departingId);
          
          if (wasActiveStream || selectedBroadcasterId === departingId) {
            remoteVideo.srcObject = null;
            if (videoOverlay) videoOverlay.classList.remove('hidden');
            setStatus("Broadcaster saiu", false);
            selectedBroadcasterId = null;
            selectedBroadcasterDbId = null;
            exportActivitiesButton.disabled = true;
            exportUrlsButton.disabled = true;
            clearInterval(statsInterval);
            statsDiv.textContent = "";
            appFocusTime.clear();
            appBackgroundTime.clear();
            lastUpdateTime = null;
          }
          
          filterBroadcasters(broadcasterSearch.value);
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
          setStatus("Conectado ao broadcaster", true);
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
      console.warn("WebSocket desconectado");
      
      if (shouldReconnect) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
        setStatus(`Reconectando em ${(delay/1000).toFixed(0)}s... (tentativa ${reconnectAttempts})`, false);
        
        reconnectTimer = setTimeout(() => {
          console.log(`Tentando reconectar (tentativa ${reconnectAttempts})...`);
          connect();
        }, delay);
      } else {
        setStatus("Desconectado do servidor", false);
        disconnectButton.disabled = true;
        reconnectButton.disabled = false;
        connectButton.style.display = "inline-flex";
        connectButton.disabled = false;
      }
    };
    
    socket.onerror = (error) => {
      console.error("Erro no WebSocket:", error);
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
    if (videoOverlay) videoOverlay.classList.remove('hidden');
    clearInterval(statsInterval);
    statsDiv.textContent = "";
    appFocusTime.clear();
    appBackgroundTime.clear();
    lastUpdateTime = null;
    setStatus("Desconectado", false);
    disconnectButton.disabled = true;
    reconnectButton.disabled = false;
    connectButton.style.display = "inline-flex";
    connectButton.disabled = false;
  };

  reconnectButton.onclick = connect;

  watchButton.onclick = () => {
    selectedBroadcasterId = broadcasterSelect.value;
    const selectedOption = broadcasterSelect.options[broadcasterSelect.selectedIndex];
    selectedBroadcasterDbId = selectedOption ? selectedOption.getAttribute('data-db-id') : null;
    selectedMonitorNumber = monitorSelect.value;
    
    if (!selectedBroadcasterId || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    appFocusTime.clear();
    appBackgroundTime.clear();
    lastUpdateTime = null;

    setStatus("Solicitando transmissao...", false);

    socket.send(JSON.stringify({
      type: "watch",
      targetId: selectedBroadcasterId,
      monitor_number: selectedMonitorNumber
    }));

    exportActivitiesButton.disabled = false;
    exportUrlsButton.disabled = false;
  };

  fullscreenButton.onclick = () => {
    if (remoteVideo.requestFullscreen) remoteVideo.requestFullscreen();
  };

  const exportActivitiesButton = document.getElementById('exportActivitiesButton');
  const exportUrlsButton = document.getElementById('exportUrlsButton');
  const fromDateInput = document.getElementById('fromDate');
  const toDateInput = document.getElementById('toDate');
  const exportStatus = document.getElementById('export-status');

  function setDefaultDates() {
    const today = new Date();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    toDateInput.value = today.toISOString().split('T')[0];
    fromDateInput.value = oneWeekAgo.toISOString().split('T')[0];
    toDateInput.max = today.toISOString().split('T')[0];
  }
  
  setDefaultDates();

  async function exportReport(endpoint, filename) {
    if (!selectedBroadcasterId) {
      exportStatus.textContent = 'Selecione um broadcaster e clique em "Assistir" primeiro';
      exportStatus.className = 'export-status error';
      return;
    }
    
    if (!selectedBroadcasterDbId) {
      exportStatus.textContent = 'Este broadcaster nao esta configurado corretamente.';
      exportStatus.className = 'export-status error';
      return;
    }

    const from = fromDateInput.value;
    const to = toDateInput.value;

    if (!from || !to) {
      exportStatus.textContent = 'Selecione as datas';
      exportStatus.className = 'export-status error';
      return;
    }

    console.log(`[EXPORT] Iniciando exportação - WebSocket ID: ${selectedBroadcasterId}, DB ID: ${selectedBroadcasterDbId}`);

    exportActivitiesButton.disabled = true;
    exportUrlsButton.disabled = true;
    exportStatus.textContent = 'Gerando relatorio...';
    exportStatus.className = 'export-status';

    try {
      const url = `/api/reports/export/${endpoint}?broadcasterId=${selectedBroadcasterDbId}&fromDate=${from}&toDate=${to}`;
      console.log(`[EXPORT] URL da requisição: ${url}`);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao gerar relatorio');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${filename}_${selectedBroadcasterDbId}_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      exportStatus.textContent = 'Relatorio baixado com sucesso!';
      exportStatus.className = 'export-status success';
    } catch (error) {
      console.error('Erro ao exportar:', error);
      exportStatus.textContent = error.message;
      exportStatus.className = 'export-status error';
    } finally {
      exportActivitiesButton.disabled = false;
      exportUrlsButton.disabled = false;
    }
  }

  exportActivitiesButton.onclick = () => exportReport('excel', 'atividades');
  exportUrlsButton.onclick = () => exportReport('excel-urls', 'urls');

  connect();
});
