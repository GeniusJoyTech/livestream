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

  let socket;
  let peers = new Map();
  let selectedBroadcasterId = null;
  let selectedMonitorNumber = null;
  let broadcasters = [];
  let statsInterval = null;

  // Função para atualizar o status na interface
  function setStatus(msg, color = "#0f0") {
    statusDiv.style.color = color;
    statusDiv.textContent = msg;
  }

  // ===========================
  // Conexão WebSocket
  // ===========================
  async function connect() {
    setStatus("🔌 Conectando ao servidor...", "#ff0");
    connectButton.disabled = true;
    connectButton.textContent = "Conectando...";

    socket = new WebSocket(`ws://${location.host}`);

    socket.onopen = () => {
      console.log("✅ WebSocket conectado");
      setStatus("✅ Conectado ao servidor de sinalização", "#0f0");
      socket.send(JSON.stringify({ type: "viewer" }));
      connectButton.style.display = "none";
      disconnectButton.disabled = false;
      reconnectButton.disabled = true;
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
            name: message.broadcaster_name || `Broadcaster ${message.broadcasterId.slice(0,6)}`
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
      }
    };

    socket.onclose = () => {
      console.warn("⚠️ WebSocket desconectado");
      setStatus("⚠️ Desconectado do servidor", "#f00");
      disconnectButton.disabled = true;
      reconnectButton.disabled = false;
    };
  }

  connectButton.onclick = connect;

  // ===========================
  // Assistir ao Broadcast
  // ===========================
  watchButton.onclick = () => {
    selectedBroadcasterId = broadcasterSelect.value;
    selectedMonitorNumber = monitorSelect.value;
    if (!selectedBroadcasterId || !socket || socket.readyState !== WebSocket.OPEN) return;

    setStatus("🎬 Solicitando transmissão...", "#ff0");

    socket.send(JSON.stringify({
      type: "watch",
      targetId: selectedBroadcasterId,
      monitor_number: selectedMonitorNumber
    }));
  };

  // ===========================
  // Desconectar
  // ===========================
  disconnectButton.onclick = () => {
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

  // ===========================
  // Tela Cheia
  // ===========================
  fullscreenButton.onclick = () => {
    if (remoteVideo.requestFullscreen) remoteVideo.requestFullscreen();
  };

  // ===========================
  // Atualizar a lista de broadcasters
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
      opt.textContent = b.name;
      broadcasterSelect.appendChild(opt);
    });
  }

  // ===========================
  // Criar uma conexão WebRTC
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
  // Estatísticas em tempo real
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
});
