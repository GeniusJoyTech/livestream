let token = null;
let currentUser = null;
let broadcasters = [];
let viewers = [];
let currentBroadcaster = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login/login.html';
        return;
    }

    loadUserInfo();
    loadBroadcasters();
    loadViewers();
    
    setInterval(() => {
        loadBroadcasters();
    }, 10000);
});

// Tab Management
function showTab(event, tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'permissions') {
        loadPermissions();
    }
}

// Load User Info
async function loadUserInfo() {
    try {
        const response = await fetch('/api/users/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            currentUser = await response.json();
            document.getElementById('username-display').textContent = `👤 ${currentUser.username}`;
        } else {
            logout();
        }
    } catch (error) {
        console.error('Error loading user info:', error);
        logout();
    }
}

// Load Broadcasters
async function loadBroadcasters() {
    try {
        const response = await fetch('/api/broadcasters', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            broadcasters = data.broadcasters || [];
            renderBroadcasters();
        } else {
            showError('Erro ao carregar broadcasters');
        }
    } catch (error) {
        console.error('Error loading broadcasters:', error);
        showError('Erro ao carregar broadcasters');
    }
}

function renderBroadcasters() {
    const container = document.getElementById('broadcasters-list');
    
    if (broadcasters.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📡</div>
                <h3>Nenhum broadcaster ainda</h3>
                <p>Crie seu primeiro broadcaster para começar a monitorar dispositivos</p>
            </div>
        `;
        return;
    }

    container.innerHTML = broadcasters.map(b => {
        const isOnline = b.last_connected_at && isRecentlyConnected(b.last_connected_at);
        const statusBadge = isOnline ? '🟢 Online' : (b.last_connected_at ? '🟡 Offline' : '⚪ Nunca conectado');
        const statusClass = isOnline ? 'badge-active' : 'badge-inactive';
        
        return `
        <div class="card">
            <div class="card-header">
                <div class="card-title">${escapeHtml(b.name)}</div>
                <span class="card-badge ${statusClass}">
                    ${statusBadge}
                </span>
            </div>
            <div class="card-info">
                <div>📅 Criado: ${new Date(b.created_at).toLocaleDateString('pt-BR')}</div>
                ${b.last_connected_at ? `<div>👁️ Última conexão: ${formatLastSeen(b.last_connected_at)}</div>` : '<div>⚠️ Aguardando primeira conexão</div>'}
            </div>
            <div class="card-actions">
                <button onclick="showToken(${b.id})" class="btn-primary btn-small">🔑 Ver Token</button>
                <button onclick="deactivateBroadcaster(${b.id})" class="btn-danger btn-small">❌ Desativar</button>
            </div>
        </div>
        `;
    }).join('');
}

// Load Viewers
async function loadViewers() {
    try {
        const response = await fetch('/api/users/viewers', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            viewers = await response.json();
            renderViewers();
        } else {
            showError('Erro ao carregar viewers');
        }
    } catch (error) {
        console.error('Error loading viewers:', error);
        showError('Erro ao carregar viewers');
    }
}

function renderViewers() {
    const container = document.getElementById('viewers-list');
    
    if (viewers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <h3>Nenhum viewer ainda</h3>
                <p>Crie viewers para que outras pessoas possam visualizar os broadcasters</p>
            </div>
        `;
        return;
    }

    container.innerHTML = viewers.map(v => `
        <div class="card">
            <div class="card-header">
                <div class="card-title">${escapeHtml(v.username)}</div>
            </div>
            <div class="card-info">
                <div>📧 ${escapeHtml(v.email)}</div>
                <div>📅 Criado: ${new Date(v.created_at).toLocaleDateString('pt-BR')}</div>
            </div>
        </div>
    `).join('');
}

// Load Permissions
async function loadPermissions() {
    const container = document.getElementById('permissions-list');
    
    if (viewers.length === 0 || broadcasters.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔐</div>
                <h3>Crie broadcasters e viewers primeiro</h3>
                <p>Você precisa ter pelo menos um broadcaster e um viewer para gerenciar permissões</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '<div class="loading">Carregando permissões...</div>';

    try {
        const permissionsPromises = viewers.map(async (viewer) => {
            const response = await fetch(`/api/users/${viewer.id}/permissions`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const permissions = await response.json();
                return { viewer, permissions };
            }
            return { viewer, permissions: [] };
        });

        const viewerPermissions = await Promise.all(permissionsPromises);
        renderPermissions(viewerPermissions);
    } catch (error) {
        console.error('Error loading permissions:', error);
        showError('Erro ao carregar permissões');
    }
}

function renderPermissions(viewerPermissions) {
    const container = document.getElementById('permissions-list');
    
    container.innerHTML = viewerPermissions.map(({ viewer, permissions }) => {
        const permissionIds = permissions.map(p => p.broadcaster_id);
        
        return `
            <div class="permission-card">
                <div class="permission-header">
                    <div class="permission-icon">👤</div>
                    <div class="permission-info">
                        <h3>${escapeHtml(viewer.username)}</h3>
                        <p>${escapeHtml(viewer.email)}</p>
                    </div>
                </div>
                <div class="permission-broadcasters">
                    ${broadcasters.map(b => {
                        const hasPermission = permissionIds.includes(b.id);
                        return `
                            <div class="permission-item ${hasPermission ? 'granted' : ''}">
                                <span class="permission-name">${escapeHtml(b.name)}</span>
                                <button 
                                    onclick="${hasPermission ? `revokePermission(${b.id}, ${viewer.id})` : `grantPermission(${b.id}, ${viewer.id})`}"
                                    class="btn-small ${hasPermission ? 'btn-danger' : 'btn-success'}"
                                >
                                    ${hasPermission ? '✖' : '✓'}
                                </button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// Modal Management
function showCreateBroadcasterModal() {
    document.getElementById('modal-create-broadcaster').classList.add('show');
}

function showCreateViewerModal() {
    document.getElementById('modal-create-viewer').classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    document.querySelectorAll('form').forEach(form => form.reset());
}

async function showToken(broadcasterId) {
    try {
        const response = await fetch(`/api/broadcasters/${broadcasterId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const broadcaster = await response.json();
            showNewBroadcasterToken(broadcaster);
        } else {
            showError('Erro ao carregar token');
        }
    } catch (error) {
        console.error('Error loading token:', error);
        showError('Erro ao carregar token');
    }
}

function showNewBroadcasterToken(broadcaster) {
    currentBroadcaster = broadcaster;
    
    const serverUrl = window.location.protocol === 'https:' 
        ? `wss://${window.location.host}` 
        : `ws://${window.location.host}`;
    
    document.getElementById('token-broadcaster-id').textContent = broadcaster.id;
    
    if (broadcaster.installationToken) {
        document.getElementById('token-value').textContent = broadcaster.token;
        const command = `python Broadcaster.py --token ${broadcaster.installationToken} --url ${serverUrl}`;
        document.getElementById('install-command').textContent = command;
        document.getElementById('server-url').textContent = serverUrl;
        document.getElementById('broadcaster-token-short').textContent = 
            broadcaster.token.substring(0, 30) + '...';
        document.querySelector('.installation-section').style.display = 'block';
        document.querySelector('.token-only-section').style.display = 'none';
    } else {
        document.getElementById('token-value-viewer').textContent = broadcaster.token;
        document.querySelector('.installation-section').style.display = 'none';
        document.querySelector('.token-only-section').style.display = 'block';
    }
    
    document.getElementById('modal-broadcaster-token').classList.add('show');
}

// Create Broadcaster
async function createBroadcaster(event) {
    event.preventDefault();
    
    try {
        const response = await fetch('/api/broadcasters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({})
        });

        if (response.ok) {
            const data = await response.json();
            closeModal('modal-create-broadcaster');
            showSuccess('Broadcaster criado com sucesso!');
            await loadBroadcasters();
            showNewBroadcasterToken(data.broadcaster);
        } else {
            const error = await response.json();
            showError(error.error || 'Erro ao criar broadcaster');
        }
    } catch (error) {
        console.error('Error creating broadcaster:', error);
        showError('Erro ao criar broadcaster');
    }
}

// Create Viewer
async function createViewer(event) {
    event.preventDefault();
    
    const username = document.getElementById('viewer-username').value;
    const email = document.getElementById('viewer-email').value;
    const password = document.getElementById('viewer-password').value;
    
    try {
        const response = await fetch('/api/users/viewers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ username, email, password })
        });

        if (response.ok) {
            closeModal('modal-create-viewer');
            showSuccess('Viewer criado com sucesso!');
            await loadViewers();
        } else {
            const error = await response.json();
            showError(error.error || 'Erro ao criar viewer');
        }
    } catch (error) {
        console.error('Error creating viewer:', error);
        showError('Erro ao criar viewer');
    }
}

// Permission Management
async function grantPermission(broadcasterId, viewerId) {
    try {
        const response = await fetch(`/api/broadcasters/${broadcasterId}/permissions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ viewerId })
        });

        if (response.ok) {
            showSuccess('Permissão concedida!');
            await loadPermissions();
        } else {
            const error = await response.json();
            showError(error.error || 'Erro ao conceder permissão');
        }
    } catch (error) {
        console.error('Error granting permission:', error);
        showError('Erro ao conceder permissão');
    }
}

async function revokePermission(broadcasterId, viewerId) {
    try {
        const response = await fetch(`/api/broadcasters/${broadcasterId}/permissions/${viewerId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            showSuccess('Permissão revogada!');
            await loadPermissions();
        } else {
            const error = await response.json();
            showError(error.error || 'Erro ao revogar permissão');
        }
    } catch (error) {
        console.error('Error revoking permission:', error);
        showError('Erro ao revogar permissão');
    }
}

// Token Management
async function refreshToken() {
    if (!currentBroadcaster) return;
    
    try {
        const response = await fetch(`/api/broadcasters/${currentBroadcaster.id}/refresh-token`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentBroadcaster.token = data.token;
            document.getElementById('token-value').textContent = data.token;
            showSuccess('Novo token gerado!');
            await loadBroadcasters();
        } else {
            const error = await response.json();
            showError(error.error || 'Erro ao gerar novo token');
        }
    } catch (error) {
        console.error('Error refreshing token:', error);
        showError('Erro ao gerar novo token');
    }
}

function copyToken() {
    const installationSection = document.querySelector('.installation-section');
    const isOwner = installationSection.style.display !== 'none';
    
    const tokenValue = isOwner 
        ? document.getElementById('token-value').textContent
        : document.getElementById('token-value-viewer').textContent;
    
    navigator.clipboard.writeText(tokenValue).then(() => {
        showSuccess('Token copiado!');
    }).catch(err => {
        console.error('Error copying token:', err);
        showError('Erro ao copiar token');
    });
}

function copyCommand() {
    const commandValue = document.getElementById('install-command').textContent;
    navigator.clipboard.writeText(commandValue).then(() => {
        showSuccess('Comando copiado! Cole no terminal do computador.');
    }).catch(err => {
        console.error('Error copying command:', err);
        showError('Erro ao copiar comando');
    });
}

// Deactivate Broadcaster
async function deactivateBroadcaster(broadcasterId) {
    if (!confirm('Deseja realmente desativar este broadcaster?')) return;
    
    try {
        const response = await fetch(`/api/broadcasters/${broadcasterId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            showSuccess('Broadcaster desativado!');
            await loadBroadcasters();
        } else {
            const error = await response.json();
            showError(error.error || 'Erro ao desativar broadcaster');
        }
    } catch (error) {
        console.error('Error deactivating broadcaster:', error);
        showError('Erro ao desativar broadcaster');
    }
}

// Utility Functions
function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login/login.html';
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function isRecentlyConnected(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins < 5;
}

function formatLastSeen(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'agora';
    if (diffMins < 60) return `${diffMins}min atrás`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d atrás`;
}

function showSuccess(message) {
    alert('✅ ' + message);
}

function showError(message) {
    alert('❌ ' + message);
}
