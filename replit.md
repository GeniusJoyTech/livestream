# SimplificaVideos - WebRTC Video Streaming Application

## Overview
SimplificaVideos is a real-time video streaming application built with WebRTC technology. It enables users to broadcast their screen/video and allows authenticated viewers to watch these streams. The application features JWT-based authentication, WebSocket communication for signaling, and peer-to-peer video transmission.

## Project Architecture

### Technology Stack
- **Backend**: Node.js with Express.js
- **WebSocket**: ws library for real-time communication
- **Authentication**: JWT (JSON Web Tokens) with bcrypt password hashing
- **Frontend**: Vanilla JavaScript with WebRTC API
- **Video Streaming**: WebRTC peer-to-peer connections

### Core Components

#### Backend Services
1. **server.js** - Main entry point
   - HTTP server on port 5000
   - Serves static files (login and viewer pages)
   - Login endpoint with JWT token generation
   - Protected routes with JWT authentication

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

4. **handlers/handlers.js** - Message handlers
   - `registerBroadcaster`: Registers new broadcasters
   - `registerViewer`: Registers viewers and sends broadcaster list
   - `handleWatch`: Connects viewer to specific broadcaster
   - `relayMessage`: Forwards WebRTC signaling messages (offer/answer/candidate)
   - `handleDisconnect`: Cleans up disconnected peers

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

## Environment Variables
- `JWT_SECRET`: Secret key for JWT token signing (set in .env file)
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

## File Structure
```
SimplificaVideos/
├── server.js              # Main server entry point
├── setupWebsocket.js      # WebSocket server configuration
├── package.json           # Node.js dependencies
├── .env                   # Environment variables (JWT_SECRET)
├── handlers/
│   └── handlers.js        # WebSocket message handlers
├── jwt/
│   ├── jwtUtils.js        # JWT token generation
│   └── authMiddleware.js  # JWT authentication middleware
├── services/
│   └── peers.js           # Peer connection management
└── public/
    ├── login/
    │   ├── login.html     # Login page
    │   └── login.js       # Login logic
    └── viewer/
        ├── viewer.html    # Viewer interface
        ├── viewer.js      # WebRTC viewer logic
        └── styles.css     # Styling

```

## Recent Changes
- **2025-11-13**: Configured for Replit environment
  - Updated server to use PORT environment variable (defaults to 5000)
  - Fixed module import path (setupWebsocket.js)
  - Added start script to package.json
  - Created .gitignore for Node.js
  - Configured workflow to run on port 5000 with webview

## User Preferences
None specified yet.

## Notes
- The broadcaster component (Python-based screen capture) is in `public/broadcaster/` but not part of the web application
- The application uses STUN server (stun.l.google.com:19302) for NAT traversal
- Heartbeat interval is set to 30 seconds for connection health monitoring
