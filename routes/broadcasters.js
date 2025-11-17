const express = require('express');
const router = express.Router();
const broadcasterService = require('../services/broadcasterService');
const userService = require('../services/userService');
const { authenticateToken } = require('../jwt/authMiddleware');

router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can create broadcasters' });
    }
    
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Broadcaster name is required' });
    }
    
    const broadcaster = await broadcasterService.createBroadcaster(name, req.user.id);
    
    await userService.logAuditAction(req.user.id, 'BROADCASTER_CREATED', 'broadcaster', broadcaster.id, req.ip, req.get('user-agent'));
    
    res.status(201).json({ 
      message: 'Broadcaster created successfully',
      broadcaster: {
        id: broadcaster.id,
        name: broadcaster.name,
        token: broadcaster.token,
        installationToken: broadcaster.installation_token,
        installationExpiresIn: '24 hours'
      }
    });
  } catch (error) {
    console.error('Create broadcaster error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    let broadcasters;
    
    if (req.user.role === 'owner') {
      broadcasters = await broadcasterService.getBroadcastersByOwner(req.user.id);
    } else {
      broadcasters = await broadcasterService.getBroadcastersForViewer(req.user.id);
    }
    
    res.json({ broadcasters });
  } catch (error) {
    console.error('Get broadcasters error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:broadcasterId/permissions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can grant permissions' });
    }
    
    const { broadcasterId } = req.params;
    const { viewerId } = req.body;
    
    if (!viewerId) {
      return res.status(400).json({ error: 'Viewer ID is required' });
    }
    
    await broadcasterService.grantPermission(parseInt(broadcasterId), viewerId, req.user.id);
    
    await userService.logAuditAction(req.user.id, 'PERMISSION_GRANTED', 'broadcaster', parseInt(broadcasterId), req.ip, req.get('user-agent'));
    
    res.json({ message: 'Permission granted successfully' });
  } catch (error) {
    console.error('Grant permission error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:broadcasterId/permissions/:viewerId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can revoke permissions' });
    }
    
    const { broadcasterId, viewerId } = req.params;
    
    await broadcasterService.revokePermission(parseInt(broadcasterId), parseInt(viewerId), req.user.id);
    
    await userService.logAuditAction(req.user.id, 'PERMISSION_REVOKED', 'broadcaster', parseInt(broadcasterId), req.ip, req.get('user-agent'));
    
    res.json({ message: 'Permission revoked successfully' });
  } catch (error) {
    console.error('Revoke permission error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:broadcasterId/refresh-token', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can refresh tokens' });
    }
    
    const { broadcasterId } = req.params;
    const updated = await broadcasterService.refreshBroadcasterToken(parseInt(broadcasterId), req.user.id);
    
    await userService.logAuditAction(req.user.id, 'TOKEN_REFRESHED', 'broadcaster', parseInt(broadcasterId), req.ip, req.get('user-agent'));
    
    res.json({ 
      message: 'Token refreshed successfully',
      token: updated.token,
      expiresAt: updated.token_expires_at
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:broadcasterId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can deactivate broadcasters' });
    }
    
    const { broadcasterId } = req.params;
    
    await broadcasterService.deactivateBroadcaster(parseInt(broadcasterId), req.user.id);
    
    await userService.logAuditAction(req.user.id, 'BROADCASTER_DEACTIVATED', 'broadcaster', parseInt(broadcasterId), req.ip, req.get('user-agent'));
    
    res.json({ message: 'Broadcaster deactivated successfully' });
  } catch (error) {
    console.error('Deactivate broadcaster error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
