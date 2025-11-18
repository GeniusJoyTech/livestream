const db = require('../database/db');
const { generateToken } = require('../jwt/jwtUtils');

const INSTALLATION_JWT_DURATION = '60d';
const INSTALLATION_TOKEN_DURATION = '1d';

class BroadcasterService {
  
  // ========== BROADCASTER METHODS ==========
  
  async checkBroadcasterNameExists(name, ownerId) {
    const result = await db.query(
      'SELECT id FROM broadcasters WHERE LOWER(name) = LOWER($1) AND owner_id = $2',
      [name, ownerId]
    );
    return result.rows.length > 0;
  }

  async createBroadcaster(name, ownerId) {
    const nameExists = await this.checkBroadcasterNameExists(name, ownerId);
    if (nameExists) {
      throw new Error('Já existe um broadcaster com este nome');
    }
    
    const installationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const installationToken = generateToken({ 
      type: 'installation', 
      ownerId, 
      broadcasterName: name
    }, INSTALLATION_TOKEN_DURATION);
    
    const result = await db.query(
      `INSERT INTO broadcasters (name, owner_id, installation_token, installation_token_expires_at, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, name, owner_id, created_at`,
      [name, ownerId, installationToken, installationExpiresAt]
    );
    
    const broadcaster = result.rows[0];
    broadcaster.installation_token = installationToken;
    
    return broadcaster;
  }
  
  async getBroadcasterById(broadcasterId, ownerId = null) {
    let query, params;
    
    if (ownerId) {
      query = `SELECT id, name, owner_id, is_active, created_at
               FROM broadcasters WHERE id = $1 AND owner_id = $2`;
      params = [broadcasterId, ownerId];
    } else {
      query = `SELECT id, name, owner_id, is_active, created_at
               FROM broadcasters WHERE id = $1`;
      params = [broadcasterId];
    }
    
    const result = await db.query(query, params);
    return result.rows[0];
  }
  
  async getBroadcasterWithTokens(broadcasterId, userId, userRole) {
    let query, params;
    
    if (userRole === 'owner') {
      query = `SELECT id, name, owner_id, installation_token, 
                      installation_token_expires_at, is_active, created_at
               FROM broadcasters 
               WHERE id = $1 AND owner_id = $2 AND is_active = true`;
      params = [broadcasterId, userId];
    } else {
      query = `SELECT b.id, b.name, b.owner_id, b.is_active, b.created_at
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
        installationToken: broadcaster.installation_token,
        installationTokenExpiresAt: broadcaster.installation_token_expires_at,
        isActive: broadcaster.is_active,
        createdAt: broadcaster.created_at
      };
    } else {
      return {
        id: broadcaster.id,
        name: broadcaster.name,
        isActive: broadcaster.is_active,
        createdAt: broadcaster.created_at
      };
    }
  }
  
  async getBroadcasterByInstallationToken(installationToken) {
    const result = await db.query(
      `SELECT id, name, owner_id, installation_token, installation_token_expires_at, is_active
       FROM broadcasters 
       WHERE installation_token = $1 AND is_active = true`,
      [installationToken]
    );
    
    const broadcaster = result.rows[0];
    if (!broadcaster) return null;
    
    // Check if installation token expired
    if (new Date() > broadcaster.installation_token_expires_at) {
      return null;
    }
    
    return broadcaster;
  }
  
  async getBroadcastersByOwner(ownerId) {
    const result = await db.query(
      `SELECT b.id, b.name, b.is_active, b.created_at,
              COUNT(bi.id) as installation_count,
              COUNT(CASE WHEN bi.is_active = true AND bi.last_connected_at > CURRENT_TIMESTAMP - INTERVAL '5 minutes' THEN 1 END) as active_installations
       FROM broadcasters b
       LEFT JOIN broadcaster_installations bi ON b.id = bi.broadcaster_id
       WHERE b.owner_id = $1 
       GROUP BY b.id, b.name, b.is_active, b.created_at
       ORDER BY b.created_at DESC`,
      [ownerId]
    );
    return result.rows;
  }
  
  async getBroadcastersForViewer(viewerId) {
    const result = await db.query(
      `SELECT b.id, b.name, b.is_active,
              COUNT(bi.id) as installation_count,
              COUNT(CASE WHEN bi.is_active = true AND bi.last_connected_at > CURRENT_TIMESTAMP - INTERVAL '5 minutes' THEN 1 END) as active_installations
       FROM broadcasters b
       INNER JOIN broadcaster_permissions bp ON b.id = bp.broadcaster_id
       LEFT JOIN broadcaster_installations bi ON b.id = bi.broadcaster_id
       WHERE bp.viewer_id = $1 AND b.is_active = true
       GROUP BY b.id, b.name, b.is_active
       ORDER BY MAX(bi.last_connected_at) DESC NULLS LAST`,
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
  
  // ========== INSTALLATION METHODS ==========
  
  async createInstallation(broadcasterId, computerName, installationToken) {
    // Verify installation token is valid for this broadcaster
    const broadcaster = await this.getBroadcasterByInstallationToken(installationToken);
    if (!broadcaster || broadcaster.id !== broadcasterId) {
      throw new Error('Invalid installation token');
    }
    
    // Generate JWT for this specific installation
    const jwtToken = generateToken({ 
      type: 'installation_jwt', 
      ownerId: broadcaster.owner_id,
      broadcasterId,
      computerName
    }, INSTALLATION_JWT_DURATION);
    
    const jwtExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days
    
    const result = await db.query(
      `INSERT INTO broadcaster_installations 
       (broadcaster_id, computer_name, jwt_token, jwt_expires_at, is_active, last_connected_at)
       VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
       ON CONFLICT (broadcaster_id, computer_name)
       DO UPDATE SET 
         jwt_token = EXCLUDED.jwt_token,
         jwt_expires_at = EXCLUDED.jwt_expires_at,
         is_active = true,
         last_connected_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, broadcaster_id, computer_name, jwt_token, jwt_expires_at, is_active, created_at`,
      [broadcasterId, computerName, jwtToken, jwtExpiresAt]
    );
    
    return result.rows[0];
  }
  
  async getInstallations(broadcasterId, ownerId = null) {
    let query, params;
    
    if (ownerId) {
      // Verify owner has access to this broadcaster
      query = `SELECT bi.id, bi.broadcaster_id, bi.computer_name, bi.is_active, 
                      bi.last_connected_at, bi.created_at
               FROM broadcaster_installations bi
               INNER JOIN broadcasters b ON bi.broadcaster_id = b.id
               WHERE bi.broadcaster_id = $1 AND b.owner_id = $2
               ORDER BY bi.last_connected_at DESC NULLS LAST`;
      params = [broadcasterId, ownerId];
    } else {
      query = `SELECT id, broadcaster_id, computer_name, is_active, 
                      last_connected_at, created_at
               FROM broadcaster_installations
               WHERE broadcaster_id = $1
               ORDER BY last_connected_at DESC NULLS LAST`;
      params = [broadcasterId];
    }
    
    const result = await db.query(query, params);
    return result.rows;
  }
  
  async getInstallationById(installationId) {
    const result = await db.query(
      `SELECT id, broadcaster_id, computer_name, jwt_token, jwt_expires_at, 
              is_active, last_connected_at, created_at
       FROM broadcaster_installations
       WHERE id = $1`,
      [installationId]
    );
    return result.rows[0];
  }
  
  async getInstallationByJwt(jwtToken) {
    const result = await db.query(
      `SELECT bi.id, bi.broadcaster_id, bi.computer_name, bi.jwt_token, bi.jwt_expires_at,
              bi.is_active, bi.last_connected_at,
              b.owner_id, b.name as broadcaster_name, b.is_active as broadcaster_active
       FROM broadcaster_installations bi
       INNER JOIN broadcasters b ON bi.broadcaster_id = b.id
       WHERE bi.jwt_token = $1 AND bi.is_active = true AND b.is_active = true`,
      [jwtToken]
    );
    
    const installation = result.rows[0];
    if (!installation) return null;
    
    // Check if JWT expired
    if (new Date() > installation.jwt_expires_at) {
      return null;
    }
    
    return installation;
  }
  
  async updateInstallationConnection(installationId) {
    await db.query(
      `UPDATE broadcaster_installations 
       SET last_connected_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [installationId]
    );
  }
  
  async deactivateInstallation(installationId, ownerId) {
    // Verify owner has access
    const result = await db.query(
      `UPDATE broadcaster_installations bi
       SET is_active = false
       FROM broadcasters b
       WHERE bi.id = $1 AND bi.broadcaster_id = b.id AND b.owner_id = $2
       RETURNING bi.id`,
      [installationId, ownerId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Installation not found or access denied');
    }
  }
  
  // ========== PERMISSION METHODS ==========
  
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
}

module.exports = new BroadcasterService();
