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
const logoutButton = document.getElementById("logoutButton");

logoutButton.addEventListener("click", () => {
  // Remove o token do localStorage
  localStorage.removeItem("token");

  // Opcional: desabilita botões e limpa a interface
  logoutButton.disabled = true;
  document.getElementById("status").textContent = "Desconectado.";
  document.getElementById("remoteVideo").srcObject = null;

  // Redireciona para a página de login
  window.location.href = "/login/login.html";
});
document.addEventListener("DOMContentLoaded", () => {
  const logoutButton = document.getElementById("logoutButton");

  // Verifica se o token existe; se não, redireciona para login
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/login/login.html";
  } else {
    logoutButton.disabled = false;
  }

  logoutButton.addEventListener("click", () => {
    // Remove o token e redireciona
    localStorage.removeItem("token");
    logoutButton.disabled = true;
    window.location.href = "/login/login.html";
  });
});