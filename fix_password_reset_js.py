#!/usr/bin/env python3
"""
Fix script to add missing password reset JavaScript functions
Run: python3 fix_password_reset_js.py
"""

import re
from pathlib import Path

INDEX_PATH = Path('/var/www/scoutloot/app/public/index.html')

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

JS_FUNCTIONS = '''
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
      const url = new URL(window.location);
      url.searchParams.delete('reset');
      window.history.replaceState({}, '', url);
      document.getElementById('reset-password').value = '';
      document.getElementById('reset-password-confirm').value = '';
    }
    
    async function checkForResetToken() {
      const urlParams = new URLSearchParams(window.location.search);
      const resetToken = urlParams.get('reset');
      
      if (resetToken) {
        try {
          const response = await fetch('/api/users/verify-reset-token/' + resetToken);
          const data = await response.json();
          
          if (data.valid) {
            currentResetToken = resetToken;
            document.getElementById('reset-email-display').textContent = 
              'Enter a new password for ' + data.email;
            openModal('reset-password');
          } else {
            showToast('This reset link is invalid or has expired.', 'error');
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

def main():
    print("Fixing password reset JavaScript...")
    
    content = read_file(INDEX_PATH)
    
    # Check if functions already properly exist (the actual function definition)
    if 'async function handleForgotPassword(event)' in content:
        print("✓ JavaScript functions already exist correctly")
        return
    
    # Find the scrollTo function and insert after it
    pattern = r"(function scrollTo\(selector\) \{\s*document\.querySelector\(selector\)\?\.scrollIntoView\(\{ behavior: 'smooth' \}\);\s*\})"
    
    if re.search(pattern, content):
        content = re.sub(pattern, r'\1' + JS_FUNCTIONS, content)
        print("✓ Added JavaScript functions after scrollTo()")
    else:
        # Alternative: insert before init() function
        pattern2 = r"(// =+\s*// INITIALIZATION\s*// =+)"
        if re.search(pattern2, content):
            content = re.sub(pattern2, JS_FUNCTIONS + r'\n    \1', content)
            print("✓ Added JavaScript functions before INITIALIZATION")
        else:
            # Last resort: insert before "async function init()"
            content = content.replace(
                'async function init() {',
                JS_FUNCTIONS + '\n    async function init() {'
            )
            print("✓ Added JavaScript functions before init()")
    
    write_file(INDEX_PATH, content)
    print("✅ Fix complete!")

if __name__ == '__main__':
    main()
