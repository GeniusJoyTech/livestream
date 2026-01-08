let token = null;
let currentUser = null;
let broadcasters = [];
let viewers = [];
let currentBroadcaster = null;
let currentFilter = 'all';

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

function filterBroadcasters() {
    currentFilter = document.getElementById('broadcaster-filter').value;
    renderBroadcasters();
}

function isTokenExpired(expiresAt) {
    if (!expiresAt) return true;
    return new Date() > new Date(expiresAt);
}

function renderBroadcasters() {
    const container = document.getElementById('broadcasters-list');
    
    let filteredBroadcasters = broadcasters;
    
    if (currentFilter === 'active') {
        filteredBroadcasters = broadcasters.filter(b => b.is_active);
    } else if (currentFilter === 'inactive') {
        filteredBroadcasters = broadcasters.filter(b => !b.is_active);
    } else if (currentFilter === 'expired') {
        filteredBroadcasters = broadcasters.filter(b => b.is_active && isTokenExpired(b.installation_token_expires_at));
    }
    
    const filterTexts = {
        'active': 'ativos',
        'inactive': 'inativos',
        'expired': 'com token expirado',
        'all': ''
    };
    
    if (filteredBroadcasters.length === 0) {
        const filterText = filterTexts[currentFilter] || '';
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📡</div>
                <h3>Nenhum broadcaster ${filterText}</h3>
                <p>${broadcasters.length === 0 ? 'Crie seu primeiro broadcaster para começar a monitorar dispositivos' : `Não há broadcasters ${filterText} no momento`}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredBroadcasters.map(b => {
        const isActive = Boolean(b.is_active);
        const installationCount = parseInt(b.installation_count) || 0;
        const activeInstallations = parseInt(b.active_installations) || 0;
        const tokenExpired = isTokenExpired(b.installation_token_expires_at);
        
        let statusBadge, statusClass;
        if (!isActive) {
            statusBadge = '🔴 Desativado';
            statusClass = 'badge-deactivated';
        } else if (activeInstallations > 0) {
            statusBadge = `🟢 ${activeInstallations} Online`;
            statusClass = 'badge-active';
        } else if (installationCount > 0) {
            statusBadge = `🟡 ${installationCount} Offline`;
            statusClass = 'badge-inactive';
        } else {
            statusBadge = '⚪ Nenhuma máquina';
            statusClass = 'badge-inactive';
        }
        
        const tokenBadge = isActive && tokenExpired ? '<span class="card-badge badge-expired">⏰ Token Expirado</span>' : '';
        
        const actionsHtml = isActive ? `
            <div class="card-actions">
                <button onclick="showInstallations(${b.id}, '${escapeHtml(b.name).replace(/'/g, "&#39;")}')" class="btn-secondary btn-small">📱 Máquinas (${installationCount})</button>
                <button onclick="showToken(${b.id})" class="btn-primary btn-small">🔑 Ver Token</button>
                <button onclick="deactivateBroadcaster(${b.id})" class="btn-danger btn-small">❌ Desativar</button>
            </div>
        ` : `
            <div class="card-actions">
                <div class="deactivated-message">Este grupo foi desativado e não pode mais ser usado</div>
            </div>
        `;
        
        return `
        <div class="card ${!isActive ? 'card-deactivated' : ''}">
            <div class="card-header">
                <div class="card-title">${escapeHtml(b.name)}</div>
                <div class="card-badges">
                    <span class="card-badge ${statusClass}">${statusBadge}</span>
                    ${tokenBadge}
                </div>
            </div>
            <div class="card-info">
                <div>📅 Criado: ${new Date(b.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
                <div>💻 Máquinas instaladas: ${installationCount} ${activeInstallations > 0 ? `(${activeInstallations} online)` : ''}</div>
            </div>
            ${actionsHtml}
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
                <div>📅 Criado: ${new Date(v.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
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
    const activeBroadcasters = broadcasters.filter(b => b.is_active);
    
    if (activeBroadcasters.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📡</div>
                <h3>Nenhum grupo ativo</h3>
                <p>Crie pelo menos um broadcaster ativo para gerenciar permissões</p>
            </div>
        `;
        return;
    }
    
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
                    ${activeBroadcasters.map(b => {
                        const hasPermission = permissionIds.includes(b.id);
                        return `
                            <div class="permission-item ${hasPermission ? 'granted' : ''}">
                                <span class="permission-name">${escapeHtml(b.name)}</span>
                                <button 
                                    onclick="${hasPermission ? `revokePermission(${b.id}, ${viewer.id})` : `grantPermission(${b.id}, ${viewer.id})`}"
                                    class="btn-small ${hasPermission ? 'btn-success' : 'btn-danger'}"
                                >
                                    ${hasPermission ? '✓' : '✖'}
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
    const broadcastersListEl = document.getElementById('viewer-broadcasters-list');
    
    const activeBroadcasters = broadcasters.filter(b => b.is_active);
    
    if (activeBroadcasters.length === 0) {
        broadcastersListEl.innerHTML = `
            <div class="alert alert-warning">
                <strong>⚠️ Nenhum broadcaster ativo</strong>
                <p>Crie pelo menos um broadcaster ativo antes de criar um viewer</p>
            </div>
        `;
    } else {
        broadcastersListEl.innerHTML = activeBroadcasters.map(b => `
            <div class="checkbox-item">
                <label>
                    <input type="checkbox" name="broadcaster-permission" value="${b.id}">
                    <span>${escapeHtml(b.name)}</span>
                </label>
            </div>
        `).join('');
    }
    
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

async function showInstallations(broadcasterId, broadcasterName) {
    try {
        const response = await fetch(`/api/broadcasters/${broadcasterId}/installations`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const installations = data.installations || [];
            
            const modal = document.createElement('div');
            modal.className = 'modal show';
            modal.innerHTML = `
                <div class="modal-content large">
                    <div class="modal-header">
                        <h3>💻 Máquinas do Grupo: ${escapeHtml(broadcasterName)}</h3>
                        <span class="close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
                    </div>
                    <div class="installations-list">
                        ${installations.length === 0 ? `
                            <div class="empty-state">
                                <div class="empty-state-icon">💻</div>
                                <h3>Nenhuma máquina instalada</h3>
                                <p>Use o token de instalação para conectar máquinas a este grupo</p>
                            </div>
                        ` : installations.map(inst => {
                            const isOnline = inst.is_active && inst.last_connected_at && isRecentlyConnected(inst.last_connected_at);
                            const statusBadge = isOnline ? '🟢 Online' : '🔴 Offline';
                            const statusClass = isOnline ? 'badge-active' : 'badge-inactive';
                            
                            return `
                                <div class="card">
                                    <div class="card-header">
                                        <div class="card-title">🖥️ ${escapeHtml(inst.computer_name)}</div>
                                        <span class="card-badge ${statusClass}">
                                            ${statusBadge}
                                        </span>
                                    </div>
                                    <div class="card-info">
                                        <div>📅 Primeiro acesso: ${new Date(inst.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${new Date(inst.created_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
                                        ${inst.last_connected_at ? `<div>🕒 Última conexão: ${formatLastSeen(inst.last_connected_at)}</div>` : '<div>⚠️ Nunca conectou</div>'}
                                        <div>🔐 Status: ${inst.is_active ? 'Ativa' : 'Desativada'}</div>
                                    </div>
                                    ${inst.is_active ? `
                                        <div class="card-actions">
                                            <button onclick="deactivateInstallation(${broadcasterId}, ${inst.id})" class="btn-danger btn-small">❌ Desativar</button>
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="modal-footer">
                        <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn-primary">Fechar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            showError('Erro ao carregar installations');
        }
    } catch (error) {
        console.error('Error loading installations:', error);
        showError('Erro ao carregar installations');
    }
}

async function deactivateInstallation(broadcasterId, installationId) {
    if (!confirm('Tem certeza que deseja desativar esta instalação? A máquina não poderá mais se conectar.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/broadcasters/${broadcasterId}/installations/${installationId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            showSuccess('Installation desativada com sucesso!');
            document.querySelectorAll('.modal').forEach(m => m.remove());
            await loadBroadcasters();
        } else {
            const error = await response.json();
            showError(error.error || 'Erro ao desativar installation');
        }
    } catch (error) {
        console.error('Error deactivating installation:', error);
        showError('Erro ao desativar installation');
    }
}

function showNewBroadcasterToken(broadcaster) {
    currentBroadcaster = broadcaster;
    
    const serverUrl = window.location.protocol === 'https:' 
        ? `wss://${window.location.host}` 
        : `ws://${window.location.host}`;
    
    document.getElementById('token-broadcaster-id').textContent = broadcaster.id;
    document.getElementById('token-broadcaster-name').textContent = broadcaster.name || `Grupo ${broadcaster.id}`;
    
    if (broadcaster.installationToken) {
        document.getElementById('token-value').textContent = broadcaster.installationToken;
        const command = `python Broadcaster.py --token ${broadcaster.installationToken} --url ${serverUrl}`;
        document.getElementById('install-command').textContent = command;
        document.getElementById('server-url').textContent = serverUrl;
        document.querySelector('.installation-section').style.display = 'block';
        document.querySelector('.token-only-section').style.display = 'none';
    } else {
        document.getElementById('token-value-viewer').textContent = broadcaster.token;
        document.querySelector('.installation-section').style.display = 'none';
        document.querySelector('.token-only-section').style.display = 'block';
    }
    
    document.getElementById('modal-broadcaster-token').classList.add('show');
}

// Download broadcaster configuration file
function downloadConfig() {
    if (!currentBroadcaster || !currentBroadcaster.installationToken) {
        showError('Token de instalação não disponível');
        return;
    }
    
    const serverUrl = window.location.protocol === 'https:' 
        ? `wss://${window.location.host}` 
        : `ws://${window.location.host}`;
    
    const config = {
        token: currentBroadcaster.installationToken,
        token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        server_url: serverUrl,
        computer_name: "COMPUTER-NAME",
        saved_at: new Date().toISOString(),
        comment: "Este arquivo foi gerado automaticamente pelo SimplificaVideos. Coloque-o na pasta ~/.simplificavideos/ e execute 'python Broadcaster.py' sem argumentos. Na primeira conexão, o token de instalação será trocado por um token permanente (60 dias) e o broadcaster_id será gerado e salvo automaticamente."
    };
    
    const jsonString = JSON.stringify(config, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'broadcaster_config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showSuccess('Arquivo broadcaster_config.json baixado! Coloque-o na pasta ~/.simplificavideos/');
}

// Create Broadcaster
async function createBroadcaster(event) {
    event.preventDefault();
    
    const name = document.getElementById('broadcaster-name').value.trim();
    
    if (!name || name.length < 3) {
        showError('O nome do broadcaster deve ter pelo menos 3 caracteres');
        return;
    }
    
    try {
        const response = await fetch('/api/broadcasters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name })
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
    
    const selectedBroadcasters = Array.from(
        document.querySelectorAll('input[name="broadcaster-permission"]:checked')
    ).map(checkbox => parseInt(checkbox.value));
    
    try {
        const response = await fetch('/api/users/viewers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                username, 
                email, 
                password,
                broadcasterIds: selectedBroadcasters
            })
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
