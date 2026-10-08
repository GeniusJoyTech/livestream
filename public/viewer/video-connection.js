// Keep ICE messages until both sides have received the SDP they belong to.
class ViewerVideoConnection {
  constructor({ send, video, onStatus, onPlaying, onRetry, retryDelay = 1000,
    setTimer = setTimeout, clearTimer = clearTimeout, PeerConnection = RTCPeerConnection }) {
    this.send = send;
    this.video = video;
    this.onStatus = onStatus;
    this.incomingCandidates = [];
    this.outgoingCandidates = [];
    this.answerSent = false;
    this.closed = false;
    this.retryTimer = null;
    this.clearTimer = clearTimer;
    this.pc = new PeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
      ]
    });
    this.pc.onicecandidate = ({ candidate }) => {
      if (!candidate || this.closed) return;
      if (this.answerSent) this.send({ type: "candidate", candidate });
      else this.outgoingCandidates.push(candidate);
    };
    this.pc.ontrack = ({ streams, track }) => {
      if (this.closed) return;
      // WebRTC also supports tracks without an associated stream.
      this.video.srcObject = streams[0] || new MediaStream([track]);
      this.video.muted = true;
      this.video.play().catch(err => {
        console.warn("Erro ao reproduzir vídeo:", err);
        this.onStatus("O navegador bloqueou a reprodução. Clique em Assistir novamente.", false);
      });
      onPlaying(this.pc);
    };
    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      const state = this.pc.connectionState;
      if (state === "connected") {
        clearTimer(this.retryTimer);
        this.retryTimer = null;
        this.onStatus("Recebendo vídeo...", true);
      }
      if (state === "connecting") this.onStatus("Estabelecendo conexão de vídeo...", false);
      if (state === "disconnected" || state === "failed") {
        this.onStatus(onRetry ? "Conexão de vídeo interrompida. Recuperando automaticamente..." :
          "Não foi possível conectar o vídeo entre as redes. Verifique a rede/firewall da máquina e tente novamente.", false);
        // A transient disconnect can recover on its own; do not destroy the PC immediately.
        if (onRetry && this.retryTimer === null) {
          this.retryTimer = setTimer(() => {
            this.retryTimer = null;
            if (!this.closed && this.pc.connectionState !== "connected") onRetry();
          }, state === "disconnected" ? Math.max(15000, retryDelay) : retryDelay);
        }
      }
    };
  }

  async acceptOffer(sdp) {
    await this.pc.setRemoteDescription(sdp);
    for (const candidate of this.incomingCandidates.splice(0)) {
      await this.pc.addIceCandidate(candidate);
    }
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    if (this.closed) return;
    // The broadcaster must get the answer before any browser ICE candidates.
    this.send({ type: "answer", sdp: this.pc.localDescription });
    this.answerSent = true;
    for (const candidate of this.outgoingCandidates.splice(0)) {
      this.send({ type: "candidate", candidate });
    }
  }

  async addCandidate(candidate) {
    if (this.closed || !candidate) return;
    if (!this.pc.remoteDescription) this.incomingCandidates.push(candidate);
    else await this.pc.addIceCandidate(candidate);
  }

  close() {
    this.closed = true;
    this.clearTimer(this.retryTimer);
    this.retryTimer = null;
    this.incomingCandidates.length = 0;
    this.outgoingCandidates.length = 0;
    this.pc.close();
  }
}

function findWatchedBroadcaster(broadcasters, watched) {
  if (!watched) return null;
  // Never recover by group ID or name: a group can contain several different machines.
  return broadcasters.find(b => watched.installation_id != null
    ? String(b.installation_id) === String(watched.installation_id)
    : b.id === watched.id) || null;
}

if (typeof module !== "undefined") module.exports = { ViewerVideoConnection, findWatchedBroadcaster };
