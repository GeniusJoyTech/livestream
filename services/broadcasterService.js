const db = require('../database/db');
const { generateToken } = require('../jwt/jwtUtils');

const BROADCASTER_TOKEN_DURATION = '60d';
const INSTALLATION_TOKEN_DURATION = '1d';

class BroadcasterService {
  
  async createBroadcaster(name, ownerId) {
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const installationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const result = await db.query(
      `INSERT INTO broadcasters (name, owner_id, token_expires_at, installation_token_expires_at, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, owner_id, created_at`,
      [name, ownerId, tokenExpiresAt, installationExpiresAt]
    );
    
    const broadcaster = result.rows[0];
    
    const token = generateToken({ 
      type: 'broadcaster', 
      ownerId, 
      broadcasterId: broadcaster.id 
    }, BROADCASTER_TOKEN_DURATION);
    
    const installationToken = generateToken({ 
      type: 'installation', 
      ownerId, 
      broadcasterId: broadcaster.id 
    }, INSTALLATION_TOKEN_DURATION);
    
    await db.query(
      `UPDATE broadcasters SET token = $1, installation_token = $2 WHERE id = $3`,
      [token, installationToken, broadcaster.id]
    );
    
    broadcaster.token = token;
    broadcaster.installation_token = installationToken;
    
    return broadcaster;
  }
  
  async getBroadcasterById(broadcasterId, ownerId = null) {
    let query, params;
    
    if (ownerId) {
      query = `SELECT id, name, owner_id, is_active, created_at, last_connected_at
               FROM broadcasters WHERE id = $1 AND owner_id = $2`;
      params = [broadcasterId, ownerId];
    } else {
      query = `SELECT id, name, owner_id, is_active, created_at, last_connected_at
               FROM broadcasters WHERE id = $1`;
      params = [broadcasterId];
    }
    
    const result = await db.query(query, params);
    return result.rows[0];
  }
  
  async getBroadcasterWithTokens(broadcasterId, userId, userRole) {
    let query, params;
    
    if (userRole === 'owner') {
      query = `SELECT id, name, owner_id, token, installation_token, 
                      token_expires_at, installation_token_expires_at,
                      is_active, created_at, last_connected_at
               FROM broadcasters 
               WHERE id = $1 AND owner_id = $2 AND is_active = true`;
      params = [broadcasterId, userId];
    } else {
      query = `SELECT b.id, b.name, b.owner_id, b.token,
                      b.is_active, b.created_at, b.last_connected_at
               FROM broadcasters b
               INNER JOIN broadcaster_permissions bp ON b.id = bp.broadcaster_id
               WHERE b.id = $1 AND bp.viewer_id = $2 AND b.is_active = true`;
      params = [broadcasterId, userId];
    }
    
    const result = await db.query(query, params);
    const broadcaster = result.rows[0];
    
    if (!broadcaster) return null;
    
    if (userRole === 'owner') {
      return {
        id: broadcaster.id,
        name: broadcaster.name,
        token: broadcaster.token,
        installationToken: broadcaster.installation_token,
        tokenExpiresAt: broadcaster.token_expires_at,
        installationTokenExpiresAt: broadcaster.installation_token_expires_at,
        isActive: broadcaster.is_active,
        createdAt: broadcaster.created_at,
        lastConnectedAt: broadcaster.last_connected_at
      };
    } else {
      return {
        id: broadcaster.id,
        name: broadcaster.name,
        token: broadcaster.token,
        isActive: broadcaster.is_active,
        createdAt: broadcaster.created_at,
        lastConnectedAt: broadcaster.last_connected_at
      };
    }
  }
  
  async getBroadcasterByToken(token) {
    const result = await db.query(
      `SELECT id, name, owner_id, token, token_expires_at, is_active
       FROM broadcasters 
       WHERE (token = $1 OR installation_token = $1) AND is_active = true`,
      [token]
    );
    
    const broadcaster = result.rows[0];
    if (!broadcaster) return null;
    
    if (new Date() > broadcaster.token_expires_at) {
      return null;
    }
    
    return broadcaster;
  }
  
  async refreshBroadcasterToken(broadcasterId, ownerId) {
    const broadcaster = await this.getBroadcasterById(broadcasterId, ownerId);
    if (!broadcaster) {
      throw new Error('Broadcaster not found or access denied');
    }
    
    const newToken = generateToken({ 
      type: 'broadcaster', 
      ownerId: broadcaster.owner_id, 
      broadcasterId 
    }, BROADCASTER_TOKEN_DURATION);
    
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    
    const result = await db.query(
      `UPDATE broadcasters 
       SET token = $1, token_expires_at = $2, installation_token = NULL, installation_token_expires_at = NULL
       WHERE id = $3
       RETURNING id, name, token, token_expires_at`,
      [newToken, tokenExpiresAt, broadcasterId]
    );
    
    return result.rows[0];
  }
  
  async updateLastConnected(broadcasterId) {
    await db.query(
      'UPDATE broadcasters SET last_connected_at = CURRENT_TIMESTAMP WHERE id = $1',
      [broadcasterId]
    );
  }
  
  async getBroadcastersByOwner(ownerId) {
    const result = await db.query(
      `SELECT id, name, is_active, created_at, last_connected_at
       FROM broadcasters 
       WHERE owner_id = $1 
       ORDER BY created_at DESC`,
      [ownerId]
    );
    return result.rows;
  }
  
  async getBroadcastersForViewer(viewerId) {
    const result = await db.query(
      `SELECT b.id, b.name, b.is_active, b.last_connected_at
       FROM broadcasters b
       INNER JOIN broadcaster_permissions bp ON b.id = bp.broadcaster_id
       WHERE bp.viewer_id = $1 AND b.is_active = true
       ORDER BY b.last_connected_at DESC`,
      [viewerId]
    );
    return result.rows;
  }
  
  async grantPermission(broadcasterId, viewerId, grantedBy) {
    const broadcaster = await this.getBroadcasterById(broadcasterId, grantedBy);
    if (!broadcaster) {
      throw new Error('Broadcaster not found or access denied');
    }
    
    const result = await db.query(
      `INSERT INTO broadcaster_permissions (broadcaster_id, viewer_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (broadcaster_id, viewer_id) DO NOTHING
       RETURNING id`,
      [broadcasterId, viewerId, grantedBy]
    );
    
    return result.rows[0];
  }
  
  async revokePermission(broadcasterId, viewerId, revokedBy) {
    const broadcaster = await this.getBroadcasterById(broadcasterId, revokedBy);
    if (!broadcaster) {
      throw new Error('Broadcaster not found or access denied');
    }
    
    await db.query(
      'DELETE FROM broadcaster_permissions WHERE broadcaster_id = $1 AND viewer_id = $2',
      [broadcasterId, viewerId]
    );
  }
  
  async hasViewerPermission(broadcasterId, viewerId) {
    const result = await db.query(
      'SELECT 1 FROM broadcaster_permissions WHERE broadcaster_id = $1 AND viewer_id = $2',
      [broadcasterId, viewerId]
    );
    return result.rows.length > 0;
  }
  
  async getViewerPermissions(viewerId) {
    const result = await db.query(
      `SELECT bp.broadcaster_id, b.name as broadcaster_name
       FROM broadcaster_permissions bp
       INNER JOIN broadcasters b ON bp.broadcaster_id = b.id
       WHERE bp.viewer_id = $1`,
      [viewerId]
    );
    return result.rows;
  }
  
  async deactivateBroadcaster(broadcasterId, ownerId) {
    const broadcaster = await this.getBroadcasterById(broadcasterId, ownerId);
    if (!broadcaster) {
      throw new Error('Broadcaster not found or access denied');
    }
    
    await db.query(
      'UPDATE broadcasters SET is_active = false WHERE id = $1',
      [broadcasterId]
    );
  }
}

module.exports = new BroadcasterService();
