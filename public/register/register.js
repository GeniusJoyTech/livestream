const form = document.getElementById('register-form');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');
const submitButton = document.getElementById('submit-button');

const requirements = {
    length: { element: document.getElementById('req-length'), test: (pwd) => pwd.length >= 8 },
    uppercase: { element: document.getElementById('req-uppercase'), test: (pwd) => /[A-Z]/.test(pwd) },
    lowercase: { element: document.getElementById('req-lowercase'), test: (pwd) => /[a-z]/.test(pwd) },
    number: { element: document.getElementById('req-number'), test: (pwd) => /[0-9]/.test(pwd) },
    special: { element: document.getElementById('req-special'), test: (pwd) => /[!@#$%^&*(),.?":{}|<>]/.test(pwd) }
};

passwordInput.addEventListener('input', () => {
    const password = passwordInput.value;
    let allMet = true;

    for (const [key, req] of Object.entries(requirements)) {
        const met = req.test(password);
        if (met) {
            req.element.classList.remove('requirement-not-met');
            req.element.classList.add('requirement-met');
        } else {
            req.element.classList.remove('requirement-met');
            req.element.classList.add('requirement-not-met');
            allMet = false;
        }
    }

    return allMet;
});

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    successMessage.style.display = 'none';
}

function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    errorMessage.style.display = 'none';
}

function hideMessages() {
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
}

function validatePassword(password) {
    for (const req of Object.values(requirements)) {
        if (!req.test(password)) {
            return false;
        }
    }
    return true;
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();

    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const adminSecret = document.getElementById('admin-secret').value;
    const privacyAgreement = document.getElementById('privacy-agreement').checked;

    if (!privacyAgreement) {
        showError('Você deve concordar com as políticas de privacidade.');
        return;
    }

    if (!validatePassword(password)) {
        showError('A senha não atende a todos os requisitos de segurança.');
        return;
    }

    if (password !== confirmPassword) {
        showError('As senhas não coincidem.');
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Criando conta...';

    try {
        const response = await fetch('/api/users/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                email: email || null,
                password,
                adminSecret: adminSecret || null
            })
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess('Conta criada com sucesso! Redirecionando para o login...');
            form.reset();
            
            setTimeout(() => {
                window.location.href = '/login/login.html';
            }, 2000);
        } else {
            showError(data.error || 'Erro ao criar conta. Tente novamente.');
            submitButton.disabled = false;
            submitButton.textContent = 'Criar Conta';
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('Erro de conexão. Verifique sua internet e tente novamente.');
        submitButton.disabled = false;
        submitButton.textContent = 'Criar Conta';
    }
});
