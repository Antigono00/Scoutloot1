import { query } from '../db/index.js';
import { Router, Request, Response } from 'express';
import {
  createUser,
  getUserById,
  getUserByEmail,
  authenticateUser,
  connectTelegram,
  disconnectTelegram,
  updateUserLocation,
  updateQuietHours,
  updateUserSettings,
  createPasswordResetToken,
  verifyResetToken,
  resetPassword,
  clearResetToken,
  deleteUser,
  changePassword,
  exportUserData,
} from '../services/users.js';
import { sendPasswordResetEmail } from '../services/email.js';

const router = Router();

// Create user (signup)
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      email, 
      password, 
      ship_to_country, 
      timezone,
      weekly_digest_enabled,
      still_available_reminders,
    } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: 'Missing required fields: email, password',
      });
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      res.status(400).json({
        error: 'Password must be at least 8 characters',
      });
      return;
    }

    const user = await createUser({
      email,
      password,  // Plain password - service will hash it
      ship_to_country,
      timezone,
      weekly_digest_enabled: weekly_digest_enabled ?? true,  // Default ON
      still_available_reminders: still_available_reminders ?? false,  // Default OFF
    });

    const { password_hash: _, reset_token: _rt, reset_token_expires: _rte, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === '23505') {
      res.status(409).json({ error: 'Email already exists' });
      return;
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: 'Missing required fields: email, password',
      });
      return;
    }

    const user = await authenticateUser(email, password);
    
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Clear any existing reset token on successful login
    await clearResetToken(user.id);

    const { password_hash: _, reset_token: _rt, reset_token_expires: _rte, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Forgot password - send reset email
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Create reset token (returns null if user not found)
    const result = await createPasswordResetToken(email);
    
    // Always return success to prevent email enumeration attacks
    // Even if user doesn't exist, we don't reveal that
    if (result) {
      // Send reset email
      const emailResult = await sendPasswordResetEmail(email, result.token);
      
      if (!emailResult.success) {
        console.error(`[AUTH] Failed to send reset email to ${email}:`, emailResult.error);
        // Still return success to user to prevent information leakage
      } else {
        console.log(`[AUTH] Password reset email sent to ${email}`);
      }
    } else {
      // User not found - log but don't reveal to client
      console.log(`[AUTH] Password reset requested for non-existent email: ${email}`);
    }

    res.json({ 
      success: true, 
      message: 'If an account exists with this email, a password reset link has been sent.' 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Verify reset token (check if valid before showing reset form)
router.get('/verify-reset-token/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;

    if (!token) {
      res.status(400).json({ valid: false, error: 'Token is required' });
      return;
    }

    const user = await verifyResetToken(token);
    
    if (!user) {
      res.status(400).json({ valid: false, error: 'Invalid or expired reset token' });
      return;
    }

    res.json({ valid: true, email: user.email });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ valid: false, error: 'Failed to verify token' });
  }
});

// Reset password (via email token)
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ error: 'Token and password are required' });
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const user = await resetPassword(token, password);
    
    if (!user) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    const { password_hash: _, reset_token: _rt, reset_token_expires: _rte, ...safeUser } = user;
    
    res.json({ 
      success: true, 
      message: 'Password has been reset successfully',
      user: safeUser 
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ============================================
// GDPR ENDPOINTS (NEW)
// ============================================

// Delete account (GDPR - Right to be forgotten)
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Optional: Add password confirmation for extra security
    const { password } = req.body;
    if (password) {
      const user = await getUserById(id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      
      // Import verifyPassword from service if we want password confirmation
      // For now, we skip this since frontend will handle confirmation dialog
    }

    const result = await deleteUser(id);
    
    if (!result.success) {
      res.status(404).json({ error: result.error || 'Failed to delete account' });
      return;
    }

    res.json({ 
      success: true, 
      message: 'Account deleted successfully. All personal data has been removed.' 
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Change password (while logged in)
router.put('/:id/password', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'Both old and new passwords are required' });
      return;
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    // Check that new password is different from old
    if (oldPassword === newPassword) {
      res.status(400).json({ error: 'New password must be different from current password' });
      return;
    }

    const result = await changePassword(id, oldPassword, newPassword);
    
    if (!result.success) {
      res.status(400).json({ error: result.error || 'Failed to change password' });
      return;
    }

    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Export my data (GDPR - Data portability)
router.get('/:id/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const data = await exportUserData(id);
    
    if (!data) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Set headers for file download
    const filename = `scoutloot-data-${id}-${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.json(data);
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// ============================================
// EXISTING ENDPOINTS
// ============================================

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const user = await getUserById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { password_hash: _, reset_token: _rt, reset_token_expires: _rte, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.get('/email/:email', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getUserByEmail(req.params.email);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { password_hash: _, reset_token: _rt, reset_token_expires: _rte, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.post('/:id/telegram', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { telegram_chat_id, telegram_user_id, telegram_username } = req.body;

    if (isNaN(id) || !telegram_chat_id || !telegram_user_id) {
      res.status(400).json({
        error: 'Missing required fields: telegram_chat_id, telegram_user_id',
      });
      return;
    }

    const user = await connectTelegram(id, {
      telegram_chat_id,
      telegram_user_id,
      telegram_username,
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { password_hash: _, reset_token: _rt, reset_token_expires: _rte, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error('Connect telegram error:', error);
    res.status(500).json({ error: 'Failed to connect Telegram' });
  }
});

router.delete('/:id/telegram', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    await disconnectTelegram(id);
    res.status(204).send();
  } catch (error) {
    console.error('Disconnect telegram error:', error);
    res.status(500).json({ error: 'Failed to disconnect Telegram' });
  }
});

// Update location - now resets notifications when country changes
router.patch('/:id/location', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { ship_to_country, ship_to_postal_code } = req.body;

    if (isNaN(id) || !ship_to_country) {
      res.status(400).json({ error: 'Missing ship_to_country' });
      return;
    }

    const user = await updateUserLocation(id, ship_to_country, ship_to_postal_code);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { password_hash: _, reset_token: _rt, reset_token_expires: _rte, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

router.patch('/:id/quiet-hours', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { quiet_hours_start, quiet_hours_end } = req.body;

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const user = await updateQuietHours(id, quiet_hours_start, quiet_hours_end);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { password_hash: _, reset_token: _rt, reset_token_expires: _rte, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error('Update quiet hours error:', error);
    res.status(500).json({ error: 'Failed to update quiet hours' });
  }
});


// Update user settings (generic PATCH) - now uses service with proper country change handling
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const { 
      ship_to_country, 
      timezone, 
      weekly_digest_enabled, 
      still_available_reminders 
    } = req.body;

    // Check if there's anything to update
    if (ship_to_country === undefined && 
        timezone === undefined && 
        weekly_digest_enabled === undefined && 
        still_available_reminders === undefined) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    // Use the service function which handles country change logic
    const user = await updateUserSettings(id, {
      ship_to_country,
      timezone,
      weekly_digest_enabled,
      still_available_reminders,
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { password_hash: _, reset_token: _rt, reset_token_expires: _rte, ...safeUser } = user;
    res.json(safeUser);
  } catch (error) {
    console.error('Update user settings error:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

export default router;
