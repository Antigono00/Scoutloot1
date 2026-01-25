#!/bin/bash
# Patch script to update frontend authentication in index.html
# Run on server: bash patch-auth-frontend-v2.sh

set -e

FILE="/var/www/scoutloot/app/public/index.html"
BACKUP="/var/www/scoutloot/app/public/index.html.backup-auth-$(date +%Y%m%d-%H%M%S)"

echo "Creating backup at $BACKUP"
cp "$FILE" "$BACKUP"

echo "Applying authentication patches..."

python3 << 'PYEOF'
file_path = "/var/www/scoutloot/app/public/index.html"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ============================================
# PATCH 1: Fix handleSignup - remove btoa, add validation, send password
# ============================================

# Replace the btoa hash with password validation
old_btoa = '''try {
        // Simple hash for demo (in production, use proper auth)
        const password_hash = btoa(password);
        
        const user = await apiCall('/users', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password_hash,'''

new_validation = '''try {
        // Validate password length
        if (password.length < 8) {
          showToast('Password must be at least 8 characters', 'error');
          return;
        }
        
        const user = await apiCall('/users', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,'''

if old_btoa in content:
    content = content.replace(old_btoa, new_validation)
    print("✓ Patch 1: handleSignup updated - removed btoa, added validation, sending password")
    changes += 1
else:
    print("⚠ Patch 1: handleSignup pattern not found (may already be patched)")

# ============================================
# PATCH 2: Fix handleLogin - add password, use POST /login
# ============================================

old_login = '''async function handleLogin(event) {
      event.preventDefault();
      
      const email = document.getElementById('login-email').value;
      
      try {
        // Fetch user by email
        const user = await apiCall(`/users/email/${encodeURIComponent(email)}`);'''

new_login = '''async function handleLogin(event) {
      event.preventDefault();
      
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      
      try {
        // Authenticate with email and password
        const user = await apiCall('/users/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });'''

if old_login in content:
    content = content.replace(old_login, new_login)
    print("✓ Patch 2: handleLogin updated - using POST /users/login with password")
    changes += 1
else:
    print("⚠ Patch 2: handleLogin pattern not found (may already be patched)")

# Save the file
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n{changes} patches applied successfully!")

if changes < 2:
    print("\nWARNING: Not all patches applied.")
    print("You may need to manually edit /var/www/scoutloot/app/public/index.html")
    print("Look for handleSignup and handleLogin functions.")
PYEOF

echo ""
echo "Backup saved at: $BACKUP"
echo "To rollback: cp $BACKUP $FILE"
