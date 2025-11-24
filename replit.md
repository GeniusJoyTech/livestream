# SimplificaVideos - WebRTC Video Streaming Application

## Overview
SimplificaVideos is a real-time video streaming application leveraging WebRTC. Its primary purpose is to allow users to broadcast their screen or video, while authenticated viewers can watch these streams. The application includes comprehensive activity monitoring, idle detection, URL tracking, and Excel reporting capabilities for viewer activity. The project aims to provide robust monitoring and streaming functionality, with a strong focus on real-time data and secure access.

## User Preferences
None specified yet.

## Replit Environment Setup (November 21, 2025)

### Current Configuration - Fresh Import Complete ✅
- **Server**: Running on port 5000 (0.0.0.0) with WebSocket support
- **Database**: Replit PostgreSQL database (heliumdb) configured via DATABASE_URL
- **Environment Secrets**: JWT_SECRET and FIRST_ADMIN_SECRET configured in shared environment
- **Workflow**: "SimplificaVideos Server" runs `node server.js` with webview output on port 5000
- **Deployment**: Configured for VM deployment (maintains WebSocket state)
- **Dependencies**: All npm packages installed successfully (228 packages, 0 vulnerabilities)

### Fresh GitHub Import Status - Completed (November 21, 2025)
✅ GitHub project successfully imported from fresh clone
✅ Environment secrets generated and configured (JWT_SECRET, FIRST_ADMIN_SECRET)
✅ Replit PostgreSQL database connected via DATABASE_URL (heliumdb)
✅ Dependencies installed (228 packages, 0 vulnerabilities)
✅ Database schema initialized successfully on first server startup
✅ Server running and accessible via webview on port 5000
✅ Login page tested and functional at /login/login.html
✅ Registration page tested and functional at /register/register.html
✅ Deployment configuration set to VM mode for WebSocket support
✅ Workflow configured with correct port (5000) and output type (webview)

### Import Notes
- The project was successfully imported with all existing code intact
- Database connection uses Replit's built-in PostgreSQL (heliumdb)
- All authentication and WebSocket features are working as expected
- The server automatically initializes the database schema on startup
- No code changes were required - project was ready for Replit environment
- Server already configured to listen on 0.0.0.0:5000, perfect for Replit's proxy

### Recent Improvements (November 17, 2025)
✅ Fixed owner dashboard to show real-time broadcaster status (online/offline)
✅ Implemented automatic status polling every 10 seconds in owner dashboard
✅ Fixed viewer report export functionality by properly mapping WebSocket IDs to database IDs
✅ Broadcaster connections now update last_connected_at timestamp in database
✅ Added db_id propagation to all broadcaster list messages for viewers
✅ Removed legacy UUID fallback code to prevent database errors
✅ Improved error messages for viewers when broadcaster is not properly configured
✅ **NEW**: Implemented broadcaster ID persistence system with automatic configuration saving
✅ **NEW**: Installation token exchange system - first connection gets permanent token (60 days)
✅ **NEW**: Broadcaster.py now saves configuration locally (broadcaster_config.json) after installation
✅ **NEW**: Automatic computer name updates in database on each connection
✅ **NEW**: Broadcasters can now run without arguments after first installation

### ✨ Broadcaster Installation & Configuration (Fully Automated - November 24, 2025)
The broadcaster installation is now completely hands-free with configuration file download:

**✨ NEW: Método Simplificado (Recomendado):**
1. Create broadcaster in owner dashboard
2. Click "📥 Baixar broadcaster_config.json" to download pre-configured file
3. Place the file in `~/.simplificavideos/` folder on the target computer
4. Run: `python Broadcaster.py` (no arguments needed!)
5. On first connection, installation token is automatically exchanged for permanent token (60 days)
6. Configuration is updated with permanent credentials and broadcaster ID

**Método Alternativo (via comando):**
1. Create broadcaster in owner dashboard to get installation token (24h validity)
2. Run: `python Broadcaster.py --token inst_xyz123 --url wss://your-domain.replit.dev`
3. Broadcaster connects, receives permanent token (60 days), and saves configuration locally

**Subsequent Executions (Both Methods):**
1. Simply run: `python Broadcaster.py` (no arguments needed!)
2. Configuration is loaded from saved `broadcaster_config.json`
3. Server URL is automatically loaded from config file

**Technical Details:**
- Downloaded config file includes: installation token, server URL, and metadata
- Installation token (24h) is exchanged for permanent token (60 days) on first connection
- Broadcaster ID is generated server-side and remains constant for the computer
- Server URL is preserved across token renewals
- Computer name is updated in database on each connection (allows renaming)
- Legacy mode still supported for broadcasters without tokens (no data persistence)

### Getting Started
1. The application is now running and accessible via the Replit webview
2. Access the login page at `/login/login.html` (automatically redirected from root)
3. Register a new account at `/register/register.html` - first user becomes admin
4. Each owner manages their own broadcasters and viewers (multi-tenant isolation)
5. Database schema is automatically initialized on startup
6. All dependencies are installed via npm

### User Registration Model
- **Open registration**: Anyone can create an owner account
- **Multi-tenant architecture**: Each owner is isolated and manages only their resources
- **Owner capabilities**: Create broadcasters, add viewers, grant permissions
- **Security**: SQL-level filtering prevents cross-tenant data access

### Environment Variables
- `JWT_SECRET`: Stored in Replit Secrets (for JWT token generation)
- `FIRST_ADMIN_SECRET`: Stored in Replit Secrets (for admin registration verification)
- `DATABASE_URL`: Replit PostgreSQL database (configured in Replit Secrets)
- `PORT`: Defaults to 5000

## System Architecture

### UI/UX Decisions
The application features a login interface, a viewer interface, and a Python-based broadcaster. The viewer interface includes a responsive side-by-side layout for video and real-time activity monitoring, with fullscreen video support.

### Technical Implementations
- **Backend**: Node.js with Express.js.
- **WebSocket**: `ws` library for real-time communication.
- **Authentication**: JWT (JSON Web Tokens) with `bcrypt` for password hashing. Production environment uses Supabase PostgreSQL for user management, role-based access, and strong password enforcement.
- **Frontend**: Vanilla JavaScript with WebRTC API for peer-to-peer connections.
- **Broadcaster**: Python application (desktop) for screen/camera capture, idle detection, active URL tracking, and application monitoring using system APIs (`psutil`, `win32gui`). It sends monitoring data and browser history.
- **Data Storage**: In development, JSON files were used for activity and browser history. For production, a Supabase PostgreSQL database is integrated for all data persistence, including activities, browser history, user management, and audit logs.
- **Excel Export**: `ExcelJS` library for generating activity and browser history reports.

### Feature Specifications
- **Real-time Streaming**: WebRTC peer-to-peer connections with dynamic broadcaster lists and signaling via WebSockets.
- **Authentication & Authorization**: JWT-based authentication for viewers and protected API routes. Production features role-based access (owner/viewer), secure user registration, and permission-based broadcaster access.
- **Activity Monitoring**:
    - Real-time application/window status on the broadcaster's computer.
    - User idle time detection based on mouse/keyboard activity.
    - Active URL tracking from browser window titles (Chrome, Firefox, Edge).
    - Browser history tracking (proof of concept, not production-ready due to security concerns).
- **Data Persistence**: Activity and browser history data are stored. In production, this is handled by PostgreSQL with audit logging and a 90-day data retention policy.
- **Reporting**: Export activity and browser history data to Excel, including statistics, detailed logs, and date range filtering.
- **Connection Management**: Heartbeat/ping-pong for connection health, auto-reconnection for viewers, and health checks for peers.

### System Design Choices
- **Modularity**: Backend structured with separate files for server, WebSocket setup, handlers, services, and routes.
- **Security Focus (Production)**: Migration to Supabase PostgreSQL, implementation of strong password requirements, owner/viewer roles, audit logging, and secure broadcaster token system.
- **Scalability**: Designed with an eventual migration to a robust database (PostgreSQL) in mind for data durability and performance.

## External Dependencies

- **Node.js Libraries**:
    - `express`: Web framework.
    - `ws`: WebSocket server.
    - `jsonwebtoken`: JWT token generation and verification.
    - `bcrypt`: Password hashing.
    - `exceljs`: Excel file generation.
    - `pg`: PostgreSQL client.
    - `crypto-js`: Cryptography utilities.

- **Python Libraries (Broadcaster)**:
    - `psutil`: System utility for process and system information.
    - `win32gui`: Windows GUI API for window information.

- **External Services**:
    - **Replit PostgreSQL**: Production database for all persistent data, user management, and audit logs.
    - **STUN Server**: `stun.l.google.com:19302` for WebRTC NAT traversal.