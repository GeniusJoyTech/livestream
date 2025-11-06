// ===========================
// Verificar token JWT
// ===========================
const token = localStorage.getItem("token");
if (!token) {
  alert("⚠️ Você precisa estar logado!");
  window.location.href = "/login/login.html";
}

// ===========================
// Conectar ao WebSocket
// ===========================
async function connect() {
  setStatus("🔌 Conectando ao servidor...", "#ff0");
  connectButton.disabled = true;
  connectButton.textContent = "Conectando...";

  // Enviar token na query string
  socket = new WebSocket(`ws://${location.host}?token=${token}`);

  socket.onopen = () => {
    console.log("✅ WebSocket conectado");
    setStatus("✅ Conectado ao servidor de sinalização", "#0f0");
    socket.send(JSON.stringify({ type: "viewer" }));
    connectButton.style.display = "none";
    disconnectButton.disabled = false;
    reconnectButton.disabled = true;
  };

}
