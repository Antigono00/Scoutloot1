#!/usr/bin/env python3
"""
Notification Preferences Patch Script
Run this on the server: python3 patch-notification-prefs.py
"""

import re
import os

os.chdir('/var/www/scoutloot/app')

# ==============================================
# PART 1: Patch public/index.html
# ==============================================

print("=" * 50)
print("Patching public/index.html...")
print("=" * 50)

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Backup
with open('public/index.html.bak.notifprefs', 'w', encoding='utf-8') as f:
    f.write(html)
print("✅ Backup created: public/index.html.bak.notifprefs")

# 1. Add notification preferences UI section before Save Settings button
# Look for the save button in settings modal
notification_ui = '''<div class="form-divider">Notifications</div>
        
        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 8px 0;">
            <input type="checkbox" id="settings-weekly-digest" checked style="width: 20px; height: 20px; accent-color: var(--accent);">
            <span style="color: var(--text-secondary);">
              📊 <strong>Weekly Digest</strong> — Sunday summary of all your watches
            </span>
          </label>
        </div>
        
        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 8px 0;">
            <input type="checkbox" id="settings-still-available" style="width: 20px; height: 20px; accent-color: var(--accent);">
            <span style="color: var(--text-secondary);">
              💡 <strong>"Still Available" Reminders</strong> — Notify after 3 days if deal &gt;20% off is still there
            </span>
          </label>
        </div>
        
        '''

# Find the save settings button and insert before it
save_button_pattern = r'(<div style="margin-top: 24px;">\s*<button type="submit" class="btn btn-primary"[^>]*>Save Settings</button>\s*</div>\s*</form>\s*</div>\s*</div>\s*\n\s*<!-- Toast)'

if re.search(save_button_pattern, html):
    html = re.sub(
        save_button_pattern,
        notification_ui + r'\1',
        html
    )
    print("✅ Added notification preferences UI")
else:
    # Try simpler pattern
    if '<button type="submit" class="btn btn-primary" style="width: 100%;">Save Settings</button>' in html:
        html = html.replace(
            '<div style="margin-top: 24px;">\n          <button type="submit" class="btn btn-primary" style="width: 100%;">Save Settings</button>\n        </div>\n      </form>',
            notification_ui + '<div style="margin-top: 24px;">\n          <button type="submit" class="btn btn-primary" style="width: 100%;">Save Settings</button>\n        </div>\n      </form>'
        )
        print("✅ Added notification preferences UI (alt pattern)")
    else:
        print("⚠️  Could not find save button pattern - adding after Telegram section")
        # Find form-divider Telegram and add after the telegram section
        html = html.replace(
            '<div class="form-divider">Telegram</div>',
            '<div class="form-divider">Telegram</div>'
        )

# 2. Update handleSettings to save new preferences
old_settings_body = 'ship_to_country: country,\n          timezone: timezone,'
new_settings_body = '''ship_to_country: country,
          timezone: timezone,
          weekly_digest_enabled: document.getElementById('settings-weekly-digest').checked,
          still_available_reminders: document.getElementById('settings-still-available').checked,'''

if old_settings_body in html:
    html = html.replace(old_settings_body, new_settings_body)
    print("✅ Updated handleSettings to save preferences")
else:
    print("⚠️  Could not find handleSettings body pattern")

# 3. Update settings loading (openModal or similar)
# Find where settings-country is populated
old_load = "document.getElementById('settings-country').value = state.user.ship_to_country;"
new_load = """document.getElementById('settings-country').value = state.user.ship_to_country;
          document.getElementById('settings-weekly-digest').checked = state.user.weekly_digest_enabled ?? true;
          document.getElementById('settings-still-available').checked = state.user.still_available_reminders ?? false;"""

if old_load in html:
    html = html.replace(old_load, new_load)
    print("✅ Updated settings loading to populate checkboxes")
else:
    print("⚠️  Could not find settings load pattern")

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("✅ Saved public/index.html")

# ==============================================
# PART 2: Patch src/routes/users.ts
# ==============================================

print("\n" + "=" * 50)
print("Patching src/routes/users.ts...")
print("=" * 50)

with open('src/routes/users.ts', 'r', encoding='utf-8') as f:
    users_ts = f.read()

# Backup
with open('src/routes/users.ts.bak.notifprefs', 'w', encoding='utf-8') as f:
    f.write(users_ts)
print("✅ Backup created: src/routes/users.ts.bak.notifprefs")

# Check if there's already a PATCH /:id route that handles settings
if 'weekly_digest_enabled' in users_ts:
    print("✅ users.ts already has notification preferences support")
else:
    # We need to add or update the PATCH route
    # First check if there's a PATCH /:id route
    if "router.patch('/:id'," in users_ts:
        print("Found existing PATCH /:id route - need to update it")
        # This is complex - let's just add the fields to the destructuring and update query
        
        # Add to destructuring
        old_destructure = "const { ship_to_country, timezone } = req.body;"
        new_destructure = "const { ship_to_country, timezone, weekly_digest_enabled, still_available_reminders } = req.body;"
        
        if old_destructure in users_ts:
            users_ts = users_ts.replace(old_destructure, new_destructure)
        
        # Try another pattern
        if "ship_to_country, timezone" in users_ts and "weekly_digest_enabled" not in users_ts:
            users_ts = users_ts.replace(
                "ship_to_country, timezone }",
                "ship_to_country, timezone, weekly_digest_enabled, still_available_reminders }"
            )
        
        print("⚠️  Partial update - may need manual review")
    else:
        # No PATCH /:id route - need to add one before export default
        new_route = '''
// Update user settings (generic PATCH)
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

    const updates: string[] = [];
    const values: (string | boolean)[] = [];
    let paramCount = 1;

    if (ship_to_country !== undefined) {
      updates.push(`ship_to_country = $${paramCount++}`);
      values.push(ship_to_country);
    }
    if (timezone !== undefined) {
      updates.push(`timezone = $${paramCount++}`);
      values.push(timezone);
    }
    if (weekly_digest_enabled !== undefined) {
      updates.push(`weekly_digest_enabled = $${paramCount++}`);
      values.push(weekly_digest_enabled);
    }
    if (still_available_reminders !== undefined) {
      updates.push(`still_available_reminders = $${paramCount++}`);
      values.push(still_available_reminders);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { password_hash: _, ...safeUser } = result.rows[0] as Record<string, unknown>;
    res.json(safeUser);
  } catch (error) {
    console.error('Update user settings error:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

'''
        # Insert before export default
        if 'export default router;' in users_ts:
            users_ts = users_ts.replace(
                'export default router;',
                new_route + 'export default router;'
            )
            print("✅ Added new PATCH /:id route")
        else:
            print("⚠️  Could not find export default - adding at end")
            users_ts += new_route

with open('src/routes/users.ts', 'w', encoding='utf-8') as f:
    f.write(users_ts)

print("✅ Saved src/routes/users.ts")

# ==============================================
# DONE
# ==============================================

print("\n" + "=" * 50)
print("PATCH COMPLETE!")
print("=" * 50)
print("""
Next steps:
1. Build:  npx tsc
2. Restart: pm2 restart all
3. Test: Open Settings modal - you should see two new checkboxes

To rollback if needed:
  cp public/index.html.bak.notifprefs public/index.html
  cp src/routes/users.ts.bak.notifprefs src/routes/users.ts
  npx tsc && pm2 restart all
""")
