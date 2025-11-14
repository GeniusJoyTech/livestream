# SimplificaVideos - WebRTC Video Streaming Application

## Overview
SimplificaVideos is a real-time video streaming application built with WebRTC technology. It enables users to broadcast their screen/video and allows authenticated viewers to watch these streams with comprehensive activity monitoring, idle detection, URL tracking, and Excel reporting capabilities.

## Project Architecture

### Technology Stack
- **Backend**: Node.js with Express.js
- **WebSocket**: ws library for real-time communication
- **Authentication**: JWT (JSON Web Tokens) with bcrypt password hashing
- **Frontend**: Vanilla JavaScript with WebRTC API
- **Video Streaming**: WebRTC peer-to-peer connections
- **Data Storage**: JSON file-based (development), PostgreSQL recommended for production
- **Excel Export**: ExcelJS library

### Core Components

#### Backend Services
1. **server.js** - Main entry point
   - HTTP server on port 5000
   - Serves static files (login and viewer pages)
   - Login endpoint with JWT token generation
   - Protected routes with JWT authentication
   - RESTful API for reports and statistics

2. **setupWebsocket.js** - WebSocket server setup
   - Handles WebSocket connections with role-based authentication
   - Viewers require JWT token
   - Broadcasters connect without JWT
   - Manages heartbeat/ping-pong for connection health

3. **services/peers.js** - Peer management
   - Maintains Map of all connected peers
   - Tracks broadcasters separately
   - Handles peer creation/deletion
   - Implements heartbeat mechanism (30s interval)

4. **services/activityStorage.js** - Activity data persistence
   - JSON file-based storage (development)
   - Stores user idle time, URLs accessed, and application data
   - **Browser history storage** with O(1) deduplication (Set-based)
   - Automatic persistence every 5 activities
   - Maximum 10-second flush interval
   - Graceful shutdown handlers for data safety
   - **Note**: For production, migrate to PostgreSQL with encryption

5. **handlers/handlers.js** - Message handlers
   - `registerBroadcaster`: Registers new broadcasters
   - `registerViewer`: Registers viewers and sends broadcaster list
   - `handleWatch`: Connects viewer to specific broadcaster
   - `relayMessage`: Forwards WebRTC signaling messages (offer/answer/candidate)
   - `handleMonitoring`: Stores monitoring data (idle time, URLs, apps)
   - `handleDisconnect`: Cleans up disconnected peers

6. **routes/reports.js** - Reporting endpoints
   - `/api/reports/export/excel` - Export activity data to Excel
   - `/api/reports/stats` - Get statistics (idle time, URLs, etc.)
   - Both endpoints require JWT authentication

#### Frontend Components
1. **public/login/** - Login interface
   - Simple username/password authentication
   - Stores JWT token in localStorage
   - Redirects to viewer on success

2. **public/viewer/** - Video viewer interface
   - WebSocket connection with JWT authentication
   - Dynamic broadcaster selection
   - WebRTC peer connection management
   - Real-time statistics display
   - Fullscreen support
   - **Activity monitoring panel**:
     - Side-by-side layout with video (responsive)
     - Real-time app/window status
     - Idle time detection
     - Active URL display
     - Date range selector for reports
     - Excel export button

3. **public/broadcaster/** - Python broadcaster (desktop app)
   - Screen/camera capture with WebRTC
   - Idle time detection using system APIs
   - Active URL tracking from browser windows
   - Application monitoring with psutil
   - **Browser history tracking** (Chrome, Firefox, Edge, Opera, Brave)
   - Sends monitoring data every 2 seconds
   - Sends browser history every 60 seconds (last 24h)

### Authentication Flow
1. User logs in via `/login` endpoint (username: admin, password: 123456)
2. Server validates credentials with bcrypt
3. Server generates JWT token with user data
4. Frontend stores token in localStorage
5. Viewer uses token for WebSocket connection
6. Server validates token on WebSocket connection

### WebRTC Flow
1. Viewer connects to WebSocket with JWT token
2. Server sends list of active broadcasters
3. Viewer selects broadcaster and sends "watch" message
4. Broadcaster creates RTCPeerConnection and sends offer
5. Viewer receives offer, creates answer
6. ICE candidates exchanged for NAT traversal
7. P2P video stream established

### Activity Monitoring Flow
1. Broadcaster detects idle time using system APIs
2. Broadcaster extracts active URL from browser window titles
3. Broadcaster sends monitoring data via WebSocket every 2s
4. Backend stores activity data in JSON file (persists every 5 entries or 10s max)
5. Viewer displays real-time monitoring data
6. User can select date range and download Excel report

## Environment Variables
- `JWT_SECRET`: Secret key for JWT token signing (set via Replit Secrets)
- `PORT`: Server port (defaults to 5000 for Replit)

## Default Credentials
- Username: `admin`
- Password: `123456`

## Features
- ✅ JWT-based authentication for viewers
- ✅ WebSocket signaling server
- ✅ WebRTC peer-to-peer video streaming
- ✅ Multiple broadcaster support
- ✅ Real-time connection statistics
- ✅ Heartbeat/ping-pong connection monitoring
- ✅ Dynamic broadcaster list updates
- ✅ Fullscreen video support
- ✅ **Real-time application monitoring**
  - Monitor apps/windows open on broadcaster's computer
  - Track foreground/background application status
  - Live updates every 2 seconds
  - Isolated telemetry per broadcaster-viewer connection
- ✅ **User idle time detection**
  - Detects when broadcaster is idle (no mouse/keyboard activity)
  - Tracks idle duration in seconds
  - Visual indicator in monitoring panel
- ✅ **Active URL tracking**
  - Extracts URLs from active browser window titles
  - Supports Chrome, Firefox, Edge browsers
  - Real-time URL display in viewer
- ✅ **Activity data storage**
  - JSON file-based storage (development)
  - Stores: timestamp, idle time, active URL, foreground app, app count
  - Automatic persistence (every 5 entries or 10s max)
  - Maximum 10,000 entries with automatic rotation
- ✅ **Excel export**
  - Download activity reports in Excel format
  - Includes statistics sheet with idle time, top URLs, app usage
  - Detailed activity log with all events
  - Date range filtering
  - JWT-authenticated endpoint
- ✅ **Browser history tracking** (⚠️ PROOF OF CONCEPT ONLY)
  - Collects history from Chrome, Firefox, Edge, Opera, Brave
  - 24-hour rolling window, sent every 60 seconds
  - Deduplication system (O(1) lookup with Set)
  - Excel export with dedicated "Histórico de Navegação" sheet
  - **WARNING**: Stored in plaintext JSON with default credentials
  - **NOT PRODUCTION READY** - see AVISO_CRITICO_SEGURANCA.md

## File Structure
```
SimplificaVideos/
├── server.js              # Main server entry point
├── setupWebsocket.js      # WebSocket server configuration
├── package.json           # Node.js dependencies
├── .env                   # Environment variables (JWT_SECRET)
├── data/
│   ├── activities.json         # Activity storage (auto-created)
│   └── browser_history.json    # Browser history (auto-created, SENSITIVE)
├── handlers/
│   └── handlers.js        # WebSocket message handlers
├── jwt/
│   ├── jwtUtils.js        # JWT token generation
│   └── authMiddleware.js  # JWT authentication middleware
├── services/
│   ├── peers.js           # Peer connection management
│   └── activityStorage.js # Activity/history persistence with deduplication
├── routes/
│   └── reports.js         # Reporting endpoints (activities + history)
├── scripts/
│   └── cleanup_history_duplicates.js  # Remove duplicate history entries
└── public/
    ├── login/
    │   ├── login.html     # Login page
    │   └── login.js       # Login logic
    ├── viewer/
    │   ├── viewer.html    # Viewer interface with monitoring
    │   ├── viewer.js      # WebRTC viewer logic
    │   └── styles.css     # Styling
    └── broadcaster/
        └── Broadcaster.py # Python broadcaster with monitoring
```

## Recent Changes
- **2025-11-14**: Production Security Implementation 🔐
  - **PostgreSQL Migration**: Migrated from JSON to PostgreSQL for all data storage
  - **User Management System**: Implemented role-based access (owner/viewer)
  - **Strong Password Requirements**: Minimum 8 characters, uppercase, lowercase, numbers, special characters
  - **Broadcaster Token System**: JWT tokens with 60-day expiration + 24h installation tokens
  - **Permission-Based Access**: Viewers only see broadcasters they're authorized to view
  - **Audit Logging**: Complete audit trail of all user actions
  - **Data Retention Policy**: Automatic cleanup of data older than 90 days
  - **Registration System**: New user registration with password validation
  - **API Endpoints**: Complete REST API for user and broadcaster management
  - **Backward Compatibility**: Still works with JSON files if DATABASE_URL not set
  - **Documentation**: Created DATABASE_SETUP.md with complete setup instructions
  - **⚠️ CRITICAL**: Default credentials removed - must create admin account via /register

- **2025-11-14**: Replit Environment Setup (Fresh GitHub Import)
  - Dependencies installed successfully via npm install (pg, crypto-js added)
  - JWT_SECRET configured via Replit Secrets (secure environment variable)
  - Workflow configured to run `node server.js` on port 5000 with webview output
  - Deployment configured for VM (always-on, required for WebSocket connections)
  - Server successfully running on 0.0.0.0:5000
  - Login and registration pages verified and accessible
  - GitHub import fully configured and operational

- **2025-11-14**: Browser History Tracking System
  - **Browser history collection**: Broadcaster.py lê histórico de Chrome, Firefox, Edge, Opera, Brave (últimas 24h)
  - **Deduplicação eficiente**: Sistema baseado em Set para verificação O(1) de duplicatas
  - **Excel export**: Nova planilha "Histórico de Navegação" com filtro de data
  - **Performance**: Otimizado de O(n·m) para O(1) com Set de chaves únicas
  - **Script de limpeza**: `scripts/cleanup_history_duplicates.js` para remover duplicatas antigas
  - **⚠️ CRÍTICO**: Funcionalidade em PROOF OF CONCEPT - veja AVISO_CRITICO_SEGURANCA.md
  - **Vulnerabilidades identificadas**: Dados não criptografados + credenciais default
  - **Status**: NÃO APROVADO para produção sem correções de segurança

- **2025-11-14**: Activity Monitoring and Reporting System
  - **Idle detection**: Broadcaster tracks user idle time using system APIs
  - **URL tracking**: Extracts active URLs from browser window titles (Chrome, Firefox, Edge)
  - **Activity storage**: JSON file-based storage with automatic persistence (every 5 entries or 10s)
  - **Excel export**: Generate reports with statistics and detailed activity log
  - **Date filtering**: Select custom date ranges for reports
  - **UI enhancements**: Activity monitoring panel in viewer with export button
  - **Data durability**: Graceful shutdown handlers, but JSON has limitations (see notes)

- **2025-11-14**: UI/UX Improvements and Enhanced Monitoring
  - **Side-by-side layout**: Monitoring table now appears next to video (responsive, stacks on mobile)
  - **Auto-reconnection**: Viewer automatically reconnects with exponential backoff (max 30s) on connection loss
  - **Health check system**: Server verifies peers every 1 minute, removes inactive peers after 2 minutes
  - **Broadcaster fixes**: Corrected WebSocket handling in Python broadcaster
  - **Enhanced logging**: Added detailed monitoring logs for debugging

- **2025-11-14**: Replit Environment Setup Complete
  - Configured JWT_SECRET via Replit Secrets (secure environment variable)
  - Workflow configured to run server on port 5000 with webview output
  - Deployment configured for VM (always-on, required for WebSocket connections)
  - Server successfully running and tested
  - Login page verified and accessible
  - GitHub import fully configured and operational
  
- **2025-11-14**: Added real-time application monitoring system
  - Broadcaster collects and sends app/window information (Python)
  - Backend filters monitoring data per viewer subscription
  - Frontend displays apps in styled table with foreground highlighting
  - Monitoring isolated per broadcaster-viewer pair
  - Uses psutil and win32gui (Windows) for app detection

- **2025-11-13**: Initial Replit configuration
  - Updated server to use PORT environment variable (defaults to 5000)
  - Fixed module import path (setupWebsocket.js)
  - Added start script to package.json
  - Created .gitignore for Node.js
  - Configured workflow to run on port 5000 with webview
  - Fixed WebSocket protocol to use wss:// for HTTPS connections

## User Preferences
None specified yet.

## Production Recommendations
### Data Durability
The current JSON file-based storage has limitations:
- **Risk**: Can lose up to 5 activity entries (~10 seconds) in crash scenarios
- **Corruption risk**: Mid-write failures can corrupt the entire log
- **Performance**: O(n) file rewrites under sustained load

**Recommended for production**: Migrate to PostgreSQL for:
- ACID guarantees and crash safety
- Better performance under load
- No data loss on crashes
- Scalability for multiple broadcasters

### Security
⚠️ **CRITICAL**: Browser history feature has severe security vulnerabilities:
- **Plaintext storage**: Browser history stored in unencrypted JSON file
- **Default credentials**: admin/123456 documented publicly
- **No access control**: Anyone with file access can read sensitive data
- **Legal risks**: LGPD/GDPR compliance issues

**MANDATORY before production**:
- Migrate browser history to encrypted PostgreSQL database
- Remove default credentials and enforce strong passwords
- Implement 2FA and role-based access control
- Consult legal counsel for compliance
- See `AVISO_CRITICO_SEGURANCA.md` for complete checklist

**Other security recommendations**:
- Change default admin credentials before deployment
- Use strong JWT_SECRET (generate with `openssl rand -base64 32`)
- Enable HTTPS in production
- Implement rate limiting on API endpoints

## Notes
- The broadcaster component (Python-based screen capture) is in `public/broadcaster/` but not part of the web application
- The application uses STUN server (stun.l.google.com:19302) for NAT traversal
- Health check runs every 60 seconds (1 minute), removes peers inactive for more than 2 minutes
- Activity storage uses JSON files for simplicity; migrate to PostgreSQL for production use
- Excel exports require JWT authentication
