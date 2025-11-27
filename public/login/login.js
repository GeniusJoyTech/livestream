document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const statusDiv = document.getElementById("status");

  form.onsubmit = async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      statusDiv.textContent = "Preencha todos os campos";
      statusDiv.className = "status-message error";
      return;
    }

    statusDiv.textContent = "Autenticando...";
    statusDiv.className = "status-message";
    statusDiv.style.display = "block";
    statusDiv.style.background = "rgba(102, 126, 234, 0.1)";
    statusDiv.style.color = "#667eea";

    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("token", data.token);
        statusDiv.textContent = "Login bem-sucedido! Redirecionando...";
        statusDiv.className = "status-message success";
        
        const userRes = await fetch("/api/users/me", {
          headers: { "Authorization": `Bearer ${data.token}` }
        });
        
        if (userRes.ok) {
          const userData = await userRes.json();
          
          setTimeout(() => {
            if (userData.role === 'owner') {
              window.location.href = "/owner-dashboard/dashboard.html";
            } else {
              window.location.href = "/viewer/viewer.html";
            }
          }, 800);
        } else {
          setTimeout(() => {
            window.location.href = "/viewer/viewer.html";
          }, 800);
        }
      } else {
        statusDiv.textContent = data.error || "Erro ao fazer login";
        statusDiv.className = "status-message error";
      }

    } catch (err) {
      console.error(err);
      statusDiv.textContent = "Erro ao conectar com o servidor";
      statusDiv.className = "status-message error";
    }
  };
});
