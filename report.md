# Resumo do Projeto SimplificaVideos

## Estrutura de Pastas

SimplificaVideos/
│
├─ server.js # Entry point do servidor
├─ setupWebSocket.js # Configura WebSocket e gerencia conexões
├─ peers.js # Gerencia peers e broadcasters
└─ handlers/
├─ broadcaster.js # Lida com registro de broadcasters
├─ viewer.js # Lida com registro de viewers
├─ watch.js # Lida com quando viewer escolhe broadcaster
├─ relay.js # Repassa mensagens WebRTC (offer, answer, candidate)
└─ disconnect.js # Lida com desconexão de peers

yaml
Copiar código

---

## server.js

**Função principal:**
- Inicializa o servidor HTTP + WebSocket.
- Serve arquivos estáticos (HTML/CSS/JS).
- Importa `setupWebSocket` e chama com o servidor HTTP.

**Funções:**

| Função | Caminho | Descrição |
|--------|---------|-----------|
| `setupWebSocket(server)` | `setupWebSocket.js` | Inicializa o WebSocket Server e define o fluxo de mensagens para cada conexão. |

---

## peers.js

Gerencia peers e broadcasters.

**Exporta:**
- `peers` → Map de todos os peers (`Map<id, { ws, role, monitor_number, name }>`).
- `broadcasters` → Map de broadcasters ativos.
- `createPeer(ws)` → cria e registra um peer com id UUID.
- `deletePeer(id)` → remove peer do map.

**Funções:**

| Função | Caminho | Descrição |
|--------|---------|-----------|
| `createPeer(ws)` | `peers.js` | Cria um novo peer com id único, adiciona ao Map `peers`. |
| `deletePeer(id)` | `peers.js` | Remove peer do Map `peers`. |

---

## setupWebSocket.js

Centraliza o WebSocket e delega as ações aos handlers.

**Funções:**

| Função | Caminho | Descrição |
|--------|---------|-----------|
| `setupWebSocket(server)` | `setupWebSocket.js` | Inicializa o WebSocket.Server, gera ID para cada peer e delega mensagens recebidas ao handler correto. |
| `handleMessage(ws, id, msg)` | `setupWebSocket.js` | Decide qual handler chamar baseado em `msg.type` (`broadcaster`, `viewer`, `watch`, `offer/answer/candidate`). |
| `handleDisconnect(ws, id)` | `setupWebSocket.js` | Chama `disconnect.js` para remover o peer e notificar viewers. |

---

## handlers/broadcaster.js

Gerencia registro e notificação de broadcasters.

| Função | Caminho | Descrição |
|--------|---------|-----------|
| `registerBroadcaster(ws, id, msg)` | `handlers/broadcaster.js` | Registra broadcaster, adiciona ao Map `broadcasters` e notifica viewers ativos sobre o novo broadcaster. |

---

## handlers/viewer.js

Gerencia registro de viewers.

| Função | Caminho | Descrição |
|--------|---------|-----------|
| `registerViewer(ws, id)` | `handlers/viewer.js` | Marca peer como viewer e envia lista de broadcasters ativos para ele. |

---

## handlers/watch.js

Gerencia quando um viewer escolhe qual broadcaster assistir.

| Função | Caminho | Descrição |
|--------|---------|-----------|
| `handleWatch(ws, id, msg)` | `handlers/watch.js` | Notifica o broadcaster selecionado que há um novo viewer e confirma para o viewer que a conexão foi aceita. |

---

## handlers/relay.js

Repassa mensagens WebRTC entre peers (broadcaster ↔ viewer).

| Função | Caminho | Descrição |
|--------|---------|-----------|
| `relayMessage(id, msg, peers)` | `handlers/relay.js` | Repasse de `offer`, `answer` ou `candidate` para o peer alvo usando `targetId`. |

---

## handlers/disconnect.js

Lida com peers desconectados.

| Função | Caminho | Descrição |
|--------|---------|-----------|
| `handleDisconnect(id, peers, broadcasters)` | `handlers/disconnect.js` | Remove peer ou broadcaster do Map, notifica viewers se broadcaster saiu. |

---