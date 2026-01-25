#!/bin/bash
# Patch script to update frontend authentication in index.html
# Run on server: bash patch-auth-frontend.sh

set -e

FILE="/var/www/scoutloot/app/public/index.html"
BACKUP="/var/www/scoutloot/app/public/index.html.backup-auth-$(date +%Y%m%d-%H%M%S)"

echo "Creating backup at $BACKUP"
cp "$FILE" "$BACKUP"

echo "Applying authentication patches..."

python3 << 'EOF'
import re

file_path = "/var/www/scoutloot/app/public/index.html"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# Patch 1: Update handleSignup to send plain password instead of password_hash
old_signup = '''async function handleSignup(event) {
      event.preventDefault();
      
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const country = document.getElementById('signup-country').value;
      
      try {
        // Simple hash for demo (in production, use proper auth)
        const password_hash = btoa(password);
        
        const user = await apiCall('/users', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password_hash,
            ship_to_country: country,'''

new_signup = '''async function handleSignup(event) {
      event.preventDefault();
      
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const country = document.getElementById('signup-country').value;
      
      if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }
      
      try {
        const user = await apiCall('/users', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            ship_to_country: country,'''

if old_signup in content:
    content = content.replace(old_signup, new_signup)
    print("✓ Patch 1: handleSignup updated to send plain password")
    changes += 1
else:
    print("⚠ Patch 1: handleSignup pattern not found (may already be patched)")

# Patch 2: Update handleLogin to use new /login endpoint with password
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
    print("✓ Patch 2: handleLogin updated to use /login endpoint with password")
    changes += 1
else:
    print("⚠ Patch 2: handleLogin pattern not found (may already be patched)")

# Save
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n{changes} patches applied.")
EOF

echo ""
echo "Backup saved at: $BACKUP"
echo "To rollback: cp $BACKUP $FILE"
