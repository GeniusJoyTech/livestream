# SimplificaVideos - WebRTC Video Streaming Application

## Overview
SimplificaVideos is a real-time video streaming application leveraging WebRTC. Its primary purpose is to allow users to broadcast their screen or video, while authenticated viewers can watch these streams. The application includes comprehensive activity monitoring, idle detection, URL tracking, and Excel reporting capabilities for viewer activity. The project aims to provide robust monitoring and streaming functionality, with a strong focus on real-time data and secure access.

## User Preferences
None specified yet.

## Replit Environment Setup (November 17, 2025)

### Current Configuration - Project Import Complete ✅
- **Server**: Running on port 5000 (0.0.0.0) with WebSocket support
- **Database**: Replit PostgreSQL database (DATABASE_URL configured in Replit Secrets)
- **Environment Secrets**: JWT_SECRET, FIRST_ADMIN_SECRET, and DATABASE_URL configured in Replit Secrets
- **Workflow**: "SimplificaVideos Server" runs `node server.js` with webview output on port 5000
- **Deployment**: Configured for VM deployment (maintains WebSocket state)
- **Dependencies**: All npm packages installed successfully (228 packages)

### Import Status
✅ GitHub project successfully imported and configured for Replit
✅ Dependencies installed (228 packages)
✅ Database schema initialized successfully
✅ Server running and accessible via webview on port 5000
✅ Login and registration pages functional
✅ Deployment configuration set to VM mode
✅ Environment secrets properly configured (JWT_SECRET, FIRST_ADMIN_SECRET, DATABASE_URL)

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