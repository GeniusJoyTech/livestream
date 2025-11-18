const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const broadcasterService = require('../services/broadcasterService');
const { authenticateToken } = require('../jwt/authMiddleware');

router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const user = await userService.createUser(username, password, email, 'owner');
    
    await userService.logAuditAction(user.id, 'USER_REGISTERED', 'user', user.id, req.ip, req.get('user-agent'));
    
    res.status(201).json({ 
      message: 'User registered successfully', 
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    
    res.status(500).json({ error: error.message });
  }
});

router.post('/create-viewer', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can create viewers' });
    }
    
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const viewer = await userService.createUser(username, password, email, 'viewer', req.user.id);
    
    await userService.logAuditAction(req.user.id, 'VIEWER_CREATED', 'user', viewer.id, req.ip, req.get('user-agent'));
    
    res.status(201).json({ 
      message: 'Viewer created successfully', 
      viewer: {
        id: viewer.id,
        username: viewer.username,
        email: viewer.email,
        role: viewer.role
      }
    });
  } catch (error) {
    console.error('Create viewer error:', error);
    
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    
    res.status(500).json({ error: error.message });
  }
});

router.get('/viewers', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can view their viewers' });
    }
    
    const viewers = await userService.getUsersByOwner(req.user.id);
    res.json(viewers);
  } catch (error) {
    console.error('Get viewers error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/viewers', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can create viewers' });
    }
    
    const { username, password, email, broadcasterIds } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const viewer = await userService.createUser(username, password, email, 'viewer', req.user.id);
    
    if (broadcasterIds && Array.isArray(broadcasterIds) && broadcasterIds.length > 0) {
      for (const broadcasterId of broadcasterIds) {
        const broadcaster = await broadcasterService.getBroadcasterById(broadcasterId, req.user.id);
        if (!broadcaster) {
          await userService.deleteUser(viewer.id);
          return res.status(400).json({ 
            error: `Broadcaster com ID ${broadcasterId} não encontrado ou não pertence a você` 
          });
        }
      }
      
      for (const broadcasterId of broadcasterIds) {
        try {
          await broadcasterService.grantPermission(broadcasterId, viewer.id, req.user.id);
        } catch (permError) {
          console.error(`Error granting permission for broadcaster ${broadcasterId}:`, permError);
          await userService.deleteUser(viewer.id);
          return res.status(500).json({ 
            error: `Erro ao conceder permissão para broadcaster ${broadcasterId}` 
          });
        }
      }
    }
    
    await userService.logAuditAction(req.user.id, 'VIEWER_CREATED', 'user', viewer.id, req.ip, req.get('user-agent'));
    
    res.status(201).json(viewer);
  } catch (error) {
    console.error('Create viewer error:', error);
    
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    
    res.status(500).json({ error: error.message });
  }
});

router.put('/viewers/:viewerId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can update viewers' });
    }
    
    const { viewerId } = req.params;
    const viewer = await userService.getUserById(viewerId);
    
    if (!viewer || viewer.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Viewer not found' });
    }
    
    const updatedViewer = await userService.updateUser(viewerId, req.body);
    
    await userService.logAuditAction(req.user.id, 'VIEWER_UPDATED', 'user', viewerId, req.ip, req.get('user-agent'));
    
    res.json({ viewer: updatedViewer });
  } catch (error) {
    console.error('Update viewer error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/viewers/:viewerId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can delete viewers' });
    }
    
    const { viewerId } = req.params;
    const viewer = await userService.getUserById(viewerId);
    
    if (!viewer || viewer.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Viewer not found' });
    }
    
    await userService.deleteUser(viewerId);
    
    await userService.logAuditAction(req.user.id, 'VIEWER_DELETED', 'user', viewerId, req.ip, req.get('user-agent'));
    
    res.json({ message: 'Viewer deactivated successfully' });
  } catch (error) {
    console.error('Delete viewer error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    
    const user = await userService.getUserByUsername(req.user.username);
    const bcrypt = require('bcrypt');
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    await userService.changePassword(req.user.id, newPassword);
    
    await userService.logAuditAction(req.user.id, 'PASSWORD_CHANGED', 'user', req.user.id, req.ip, req.get('user-agent'));
    
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await userService.getUserById(req.user.id);
    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await userService.getUserById(req.user.id);
    res.json(user);
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:userId/permissions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ error: 'Only owners can view permissions' });
    }
    
    const { userId } = req.params;
    const viewer = await userService.getUserById(userId);
    
    if (!viewer || viewer.created_by !== req.user.id) {
      return res.status(404).json({ error: 'Viewer not found' });
    }
    
    const permissions = await broadcasterService.getViewerPermissions(userId);
    res.json(permissions);
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
