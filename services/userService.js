const bcrypt = require('bcrypt');
const db = require('../database/db');

const SALT_ROUNDS = 10;

class UserService {
  
  async createUser(username, password, email, role = 'viewer', createdBy = null) {
    if (!this.validatePassword(password)) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, number and special character');
    }
    
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    
    const result = await db.query(
      `INSERT INTO users (username, password_hash, email, role, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, role, created_at`,
      [username, passwordHash, email, role, createdBy]
    );
    
    return result.rows[0];
  }
  
  async getUserById(userId) {
    const result = await db.query(
      'SELECT id, username, email, role, created_by, created_at, last_login, is_active FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  }
  
  async getUserByUsername(username) {
    const result = await db.query(
      'SELECT id, username, password_hash, email, role, created_by, is_active FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0];
  }
  
  async validateCredentials(username, password) {
    const user = await this.getUserByUsername(username);
    
    if (!user || !user.is_active) {
      return null;
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return null;
    }
    
    await this.updateLastLogin(user.id);
    
    delete user.password_hash;
    return user;
  }
  
  async updateLastLogin(userId) {
    await db.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
  }
  
  async getUsersByOwner(ownerId) {
    const result = await db.query(
      `SELECT id, username, email, role, created_at, last_login, is_active 
       FROM users 
       WHERE created_by = $1 
       ORDER BY created_at DESC`,
      [ownerId]
    );
    return result.rows;
  }
  
  async updateUser(userId, updates) {
    const allowedFields = ['email', 'is_active'];
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
    
    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    values.push(userId);
    const result = await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING id, username, email, role, is_active`,
      values
    );
    
    return result.rows[0];
  }
  
  async deleteUser(userId) {
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [userId]);
  }
  
  async changePassword(userId, newPassword) {
    if (!this.validatePassword(newPassword)) {
      throw new Error('Password must be at least 8 characters with uppercase, lowercase, number and special character');
    }
    
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId]
    );
  }
  
  validatePassword(password) {
    if (password.length < 8) return false;
    
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    return hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
  }
  
  async logAuditAction(userId, action, resourceType = null, resourceId = null, ipAddress = null, userAgent = null) {
    await db.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, resourceType, resourceId, ipAddress, userAgent]
    );
  }
}

module.exports = new UserService();
