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
        
        // Redirecionar para viewer
        setTimeout(() => {
          window.location.href = "/viewer/viewer.html";
        }, 1000);
      } else {
        statusDiv.textContent = `❌ ${data.error}`;
      }

    } catch (err) {
      console.error(err);
      statusDiv.textContent = "❌ Erro ao conectar com o servidor";
    }
  };
});
