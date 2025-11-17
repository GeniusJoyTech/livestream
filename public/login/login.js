document.addEventListener("DOMContentLoaded", () => {
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginButton = document.getElementById("loginButton");
  const statusDiv = document.getElementById("status");

  loginButton.onclick = async () => {
    const username = usernameInput.value;
    const password = passwordInput.value;

    if (!username || !password) {
      statusDiv.textContent = "❌ Preencha todos os campos";
      return;
    }

    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok) {
        // Armazenar token no localStorage
        localStorage.setItem("token", data.token);
        statusDiv.textContent = "✅ Login bem-sucedido! Redirecionando...";
        
        // Verificar role do usuário e redirecionar
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
          }, 1000);
        } else {
          // Fallback para viewer se não conseguir verificar role
          setTimeout(() => {
            window.location.href = "/viewer/viewer.html";
          }, 1000);
        }
      } else {
        statusDiv.textContent = `❌ ${data.error}`;
      }

    } catch (err) {
      console.error(err);
      statusDiv.textContent = "❌ Erro ao conectar com o servidor";
    }
  };
});
