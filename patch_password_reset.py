#!/usr/bin/env python3
"""
Patch script to add password reset functionality to ScoutLoot index.html
Run: python3 patch_password_reset.py
"""

import re
import shutil
from pathlib import Path

# Path to index.html
INDEX_PATH = Path('/var/www/scoutloot/app/public/index.html')
BACKUP_PATH = Path('/var/www/scoutloot/app/public/index.html.backup')

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def patch_login_modal_forgot_link(content):
    """Add 'Forgot Password?' link to login modal"""
    
    # Find the login form and add forgot password link after the password field
    old_pattern = r'''(<div class="form-group">
          <label for="login-password">Password</label>
          <input type="password" id="login-password" placeholder="••••••••" required>
        </div>)'''
    
    new_code = r'''\1
        <div style="text-align: right; margin-bottom: 16px;">
          <a href="#" onclick="switchModal('login', 'forgot-password'); return false;" style="font-size: 0.85rem; color: var(--accent); text-decoration: none;">Forgot password?</a>
        </div>'''
    
    # Try exact match first
    if old_pattern.replace('\n', '').replace(' ', '') in content.replace('\n', '').replace(' ', ''):
        # Use more flexible regex
        pattern = r'(<div class="form-group">\s*<label for="login-password">Password</label>\s*<input type="password" id="login-password"[^>]*>\s*</div>)'
        content = re.sub(pattern, r'''\1
        <div style="text-align: right; margin-bottom: 16px;">
          <a href="#" onclick="switchModal('login', 'forgot-password'); return false;" style="font-size: 0.85rem; color: var(--accent); text-decoration: none;">Forgot password?</a>
        </div>''', content)
        print("✓ Added 'Forgot password?' link to login modal")
    else:
        print("⚠ Could not find login password field, trying alternative pattern...")
        # Try alternative approach - find by login-password id
        if 'id="login-password"' in content and 'Forgot password?' not in content:
            # Insert after the password form-group closing div
            pattern = r'(id="login-password"[^>]*>\s*</div>)'
            replacement = r'''\1
        <div style="text-align: right; margin-bottom: 16px;">
          <a href="#" onclick="switchModal('login', 'forgot-password'); return false;" style="font-size: 0.85rem; color: var(--accent); text-decoration: none;">Forgot password?</a>
        </div>'''
            content = re.sub(pattern, replacement, content)
            print("✓ Added 'Forgot password?' link (alternative method)")
    
    return content

def add_forgot_password_modal(content):
    """Add the Forgot Password modal after the Settings modal"""
    
    if 'modal-forgot-password' in content:
        print("⚠ Forgot Password modal already exists, skipping...")
        return content
    
    forgot_modal = '''
  <!-- Forgot Password Modal -->
  <div class="modal-overlay" id="modal-forgot-password">
    <div class="modal" style="position: relative;">
      <button class="modal-close" onclick="closeModal('forgot-password')">×</button>
      <h2>Forgot Password?</h2>
      <p class="modal-subtitle">Enter your email and we'll send you a reset link</p>
      
      <form onsubmit="handleForgotPassword(event)">
        <div class="form-group">
          <label for="forgot-email">Email</label>
          <input type="email" id="forgot-email" placeholder="you@example.com" required>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;" id="forgot-submit-btn">Send Reset Link</button>
      </form>
      
      <div class="modal-footer">
        Remember your password? <a href="#" onclick="switchModal('forgot-password', 'login'); return false;">Log in</a>
      </div>
    </div>
  </div>
'''
    
    # Insert after settings modal
    settings_modal_end = '</div>\n  </div>\n  \n  <!-- Toast Container -->'
    if settings_modal_end in content:
        content = content.replace(settings_modal_end, '</div>\n  </div>\n' + forgot_modal + '\n  <!-- Toast Container -->')
        print("✓ Added Forgot Password modal")
    else:
        # Try to find toast container and insert before it
        if '<!-- Toast Container -->' in content:
            content = content.replace('<!-- Toast Container -->', forgot_modal + '\n  <!-- Toast Container -->')
            print("✓ Added Forgot Password modal (alternative method)")
        else:
            print("✗ Could not find insertion point for Forgot Password modal")
    
    return content

def add_reset_password_modal(content):
    """Add the Reset Password modal after the Forgot Password modal"""
    
    if 'modal-reset-password' in content:
        print("⚠ Reset Password modal already exists, skipping...")
        return content
    
    reset_modal = '''
  <!-- Reset Password Modal -->
  <div class="modal-overlay" id="modal-reset-password">
    <div class="modal" style="position: relative;">
      <button class="modal-close" onclick="closeResetModal()">×</button>
      <h2>Reset Password</h2>
      <p class="modal-subtitle" id="reset-email-display">Enter your new password</p>
      
      <form onsubmit="handleResetPassword(event)">
        <div class="form-group">
          <label for="reset-password">New Password</label>
          <input type="password" id="reset-password" placeholder="••••••••" minlength="8" required>
        </div>
        <div class="form-group">
          <label for="reset-password-confirm">Confirm Password</label>
          <input type="password" id="reset-password-confirm" placeholder="••••••••" minlength="8" required>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;" id="reset-submit-btn">Reset Password</button>
      </form>
    </div>
  </div>
'''
    
    # Insert before toast container
    if '<!-- Toast Container -->' in content:
        content = content.replace('<!-- Toast Container -->', reset_modal + '\n  <!-- Toast Container -->')
        print("✓ Added Reset Password modal")
    else:
        print("✗ Could not find insertion point for Reset Password modal")
    
    return content

def add_password_reset_js(content):
    """Add JavaScript functions for password reset"""
    
    if 'handleForgotPassword' in content:
        print("⚠ Password reset JavaScript already exists, skipping...")
        return content
    
    js_code = '''
    // ===========================================
    // PASSWORD RESET FUNCTIONS
    // ===========================================
    
    let currentResetToken = null;
    
    async function handleForgotPassword(event) {
      event.preventDefault();
      
      const email = document.getElementById('forgot-email').value;
      const submitBtn = document.getElementById('forgot-submit-btn');
      const originalText = submitBtn.textContent;
      
      try {
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        
        const response = await fetch('/api/users/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
          closeModal('forgot-password');
          showToast('If an account exists, a reset link has been sent to your email.', 'success');
          document.getElementById('forgot-email').value = '';
        } else {
          showToast(data.error || 'Failed to send reset email', 'error');
        }
      } catch (error) {
        console.error('Forgot password error:', error);
        showToast('Failed to send reset email', 'error');
      } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    }
    
    async function handleResetPassword(event) {
      event.preventDefault();
      
      const password = document.getElementById('reset-password').value;
      const confirmPassword = document.getElementById('reset-password-confirm').value;
      const submitBtn = document.getElementById('reset-submit-btn');
      const originalText = submitBtn.textContent;
      
      if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
      }
      
      if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }
      
      if (!currentResetToken) {
        showToast('Invalid reset token', 'error');
        return;
      }
      
      try {
        submitBtn.textContent = 'Resetting...';
        submitBtn.disabled = true;
        
        const response = await fetch('/api/users/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: currentResetToken, password }),
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          // Auto-login the user
          state.user = data.user;
          saveToStorage('user', data.user);
          
          closeResetModal();
          updateUI();
          showDashboard();
          await loadWatches();
          showToast('Password reset successful! Welcome back.', 'success');
        } else {
          showToast(data.error || 'Failed to reset password', 'error');
        }
      } catch (error) {
        console.error('Reset password error:', error);
        showToast('Failed to reset password', 'error');
      } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    }
    
    function closeResetModal() {
      closeModal('reset-password');
      currentResetToken = null;
      // Clear URL parameter
      const url = new URL(window.location);
      url.searchParams.delete('reset');
      window.history.replaceState({}, '', url);
      // Clear form
      document.getElementById('reset-password').value = '';
      document.getElementById('reset-password-confirm').value = '';
    }
    
    async function checkForResetToken() {
      const urlParams = new URLSearchParams(window.location.search);
      const resetToken = urlParams.get('reset');
      
      if (resetToken) {
        try {
          // Verify the token is valid
          const response = await fetch(`/api/users/verify-reset-token/${resetToken}`);
          const data = await response.json();
          
          if (data.valid) {
            currentResetToken = resetToken;
            document.getElementById('reset-email-display').textContent = 
              `Enter a new password for ${data.email}`;
            openModal('reset-password');
          } else {
            showToast('This reset link is invalid or has expired.', 'error');
            // Clear the URL parameter
            const url = new URL(window.location);
            url.searchParams.delete('reset');
            window.history.replaceState({}, '', url);
          }
        } catch (error) {
          console.error('Error verifying reset token:', error);
          showToast('Failed to verify reset link.', 'error');
        }
      }
    }
'''
    
    # Find a good place to insert - after the UTILITY FUNCTIONS section
    if '// UTILITY FUNCTIONS' in content:
        # Insert after utility functions section
        pattern = r'(// ===========================================\s*// UTILITY FUNCTIONS\s*// ===========================================\s*\n\s*function scrollTo\(selector\) \{\s*document\.querySelector\(selector\)\?\.scrollIntoView\(\{ behavior: \'smooth\' \}\);\s*\})'
        content = re.sub(pattern, r'\1\n' + js_code, content)
        print("✓ Added password reset JavaScript functions")
    else:
        # Try alternative - insert before INITIALIZATION section
        if '// INITIALIZATION' in content:
            content = content.replace('// ===========================================\n    // INITIALIZATION', 
                                     js_code + '\n    // ===========================================\n    // INITIALIZATION')
            print("✓ Added password reset JavaScript functions (alternative method)")
        else:
            print("✗ Could not find insertion point for JavaScript functions")
    
    return content

def update_init_function(content):
    """Update init() to check for reset token"""
    
    if 'checkForResetToken()' in content:
        print("⚠ init() already checks for reset token, skipping...")
        return content
    
    # Find the init function and add the reset token check
    # Look for the pattern at the end of init function
    pattern = r"(async function init\(\) \{[\s\S]*?)(// Run on page load)"
    
    match = re.search(pattern, content)
    if match:
        # Insert checkForResetToken() call before the end of init
        old_init = match.group(1)
        if 'clearStorage();' in old_init:
            # Insert after the try-catch block in init
            new_init = old_init.rstrip() + '\n      \n      // Check for password reset token in URL\n      await checkForResetToken();\n    }\n    '
            # Find the closing brace of init and add our call before it
            # Actually, let's be more careful
            pass
    
    # More reliable approach - find the specific pattern
    old_pattern = '''try {
          const user = await apiCall(`/users/${savedUser.id}`);
          state.user = user;
          updateUI();
          showDashboard();
        } catch (error) {
          // User no longer exists, clear storage
          clearStorage();
        }
      }
    }'''
    
    new_pattern = '''try {
          const user = await apiCall(`/users/${savedUser.id}`);
          state.user = user;
          updateUI();
          showDashboard();
        } catch (error) {
          // User no longer exists, clear storage
          clearStorage();
        }
      }
      
      // Check for password reset token in URL
      await checkForResetToken();
    }'''
    
    if old_pattern in content:
        content = content.replace(old_pattern, new_pattern)
        print("✓ Updated init() to check for reset token")
    else:
        # Try more flexible pattern
        if 'clearStorage();' in content and 'checkForResetToken' not in content:
            # Find init function closing
            init_pattern = r"(clearStorage\(\);\s*\}\s*\}\s*\})"
            replacement = r"clearStorage();\n        }\n      }\n      \n      // Check for password reset token in URL\n      await checkForResetToken();\n    }"
            content = re.sub(init_pattern, replacement, content)
            print("✓ Updated init() to check for reset token (alternative method)")
        else:
            print("⚠ Could not update init() function")
    
    return content

def main():
    print("=" * 60)
    print("ScoutLoot Password Reset Patch Script")
    print("=" * 60)
    
    # Check if file exists
    if not INDEX_PATH.exists():
        print(f"✗ Error: {INDEX_PATH} not found")
        return 1
    
    # Create backup
    print(f"\n📁 Creating backup at {BACKUP_PATH}")
    shutil.copy(INDEX_PATH, BACKUP_PATH)
    
    # Read content
    print(f"📖 Reading {INDEX_PATH}")
    content = read_file(INDEX_PATH)
    original_length = len(content)
    
    # Apply patches
    print("\n🔧 Applying patches...\n")
    
    content = patch_login_modal_forgot_link(content)
    content = add_forgot_password_modal(content)
    content = add_reset_password_modal(content)
    content = add_password_reset_js(content)
    content = update_init_function(content)
    
    # Write updated content
    print(f"\n💾 Writing updated {INDEX_PATH}")
    write_file(INDEX_PATH, content)
    
    new_length = len(content)
    print(f"\n📊 File size: {original_length:,} → {new_length:,} characters (+{new_length - original_length:,})")
    
    print("\n" + "=" * 60)
    print("✅ Patch complete!")
    print(f"   Backup saved to: {BACKUP_PATH}")
    print("=" * 60)
    
    return 0

if __name__ == '__main__':
    exit(main())
