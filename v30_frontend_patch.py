#!/usr/bin/env python3
"""
V30 Frontend Patch - Regional Currency Support

Changes:
- set.html: Uses user's country to determine currency symbol client-side
- minifig.html: Passes country to history API, uses returned symbol

Usage:
    scp v30_frontend_patch.py root@188.166.160.168:/var/www/scoutloot/app/
    ssh root@188.166.160.168 "cd /var/www/scoutloot/app && python3 v30_frontend_patch.py"
"""

import os
import shutil
import re
import sys

BASE_DIR = '/var/www/scoutloot/app'

def patch_set_html():
    """Patch set.html for regional currency support"""
    filepath = os.path.join(BASE_DIR, 'public/set.html')
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # 1. Add currencySymbol and helper after "let priceChart = null;"
    helper_code = '''let priceChart = null;
    let currencySymbol = '€'; // V30: Dynamic currency symbol
    
    // V30: Get currency symbol based on user country
    function getCurrencySymbol() {
      try {
        const userData = localStorage.getItem('scoutloot_user');
        if (userData) {
          const user = JSON.parse(userData);
          const country = (user.ship_to_country || '').toUpperCase();
          if (country === 'US') return '$';
          if (country === 'CA') return 'C$';
          if (country === 'GB') return '£';
        }
      } catch (e) {}
      return '€';
    }
    currencySymbol = getCurrencySymbol();'''
    
    content = content.replace('let priceChart = null;', helper_code)
    
    # 2. Replace hardcoded € in tooltip callback
    # Pattern: `${context.dataset.label}: €${context.raw.toFixed(2)}`
    content = content.replace(
        '${context.dataset.label}: €${context.raw.toFixed(2)}',
        '${context.dataset.label}: ${currencySymbol}${context.raw.toFixed(2)}'
    )
    
    # 3. Replace hardcoded € in Y-axis ticks
    content = content.replace(
        "return '€' + value;",
        "return currencySymbol + value;"
    )
    
    with open(filepath, 'w') as f:
        f.write(content)
    
    return True

def patch_minifig_html():
    """Patch minifig.html for regional currency support"""
    filepath = os.path.join(BASE_DIR, 'public/minifig.html')
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # 1. Add currencySymbol and helper after "let priceChart = null;"
    helper_code = '''let priceChart = null;
    let currencySymbol = '€'; // V30: Updated from API response
    
    // V30: Get user country for API calls
    function getUserCountry() {
      try {
        const userData = localStorage.getItem('scoutloot_user');
        if (userData) {
          const user = JSON.parse(userData);
          return user.ship_to_country || 'US';
        }
      } catch (e) {}
      return 'US';
    }'''
    
    content = content.replace('let priceChart = null;', helper_code)
    
    # 2. Update fetch URL to include country parameter
    content = content.replace(
        '/api/minifigs/${figNum}/history?days=${days}`',
        '/api/minifigs/${figNum}/history?days=${days}&country=${getUserCountry()}`'
    )
    
    # 3. Add symbol update after "const history = await response.json();"
    content = content.replace(
        'const history = await response.json();',
        '''const history = await response.json();
        currencySymbol = history.symbol || '€'; // V30: Use API symbol'''
    )
    
    # 4. Replace hardcoded € in tooltip callback
    content = content.replace(
        '${context.dataset.label}: €${context.raw.y.toFixed(2)}',
        '${context.dataset.label}: ${currencySymbol}${context.raw.y.toFixed(2)}'
    )
    
    # 5. Replace hardcoded € in Y-axis ticks
    content = content.replace(
        "return '€' + value;",
        "return currencySymbol + value;"
    )
    
    with open(filepath, 'w') as f:
        f.write(content)
    
    return True

def verify_patches():
    """Verify the patches were applied correctly"""
    errors = []
    
    # Check set.html
    with open(os.path.join(BASE_DIR, 'public/set.html'), 'r') as f:
        set_content = f.read()
    
    if 'currencySymbol' not in set_content:
        errors.append('set.html: currencySymbol not found')
    if 'getCurrencySymbol' not in set_content:
        errors.append('set.html: getCurrencySymbol function not found')
    if "return '€' + value;" in set_content:
        errors.append('set.html: hardcoded € still in Y-axis')
    
    # Check minifig.html
    with open(os.path.join(BASE_DIR, 'public/minifig.html'), 'r') as f:
        minifig_content = f.read()
    
    if 'getUserCountry' not in minifig_content:
        errors.append('minifig.html: getUserCountry function not found')
    if 'country=${getUserCountry()}' not in minifig_content:
        errors.append('minifig.html: country parameter not in API call')
    if 'history.symbol' not in minifig_content:
        errors.append('minifig.html: symbol from API not used')
    if "return '€' + value;" in minifig_content:
        errors.append('minifig.html: hardcoded € still in Y-axis')
    
    return errors

def main():
    print("=== V30 Frontend Patch: Regional Currency Support ===")
    print()
    
    # Check we're in the right directory
    if not os.path.exists(os.path.join(BASE_DIR, 'public/set.html')):
        print(f"ERROR: Cannot find {BASE_DIR}/public/set.html")
        print("Make sure you're running from the app directory")
        sys.exit(1)
    
    # Create backups
    print("[1/4] Creating backups...")
    shutil.copy(
        os.path.join(BASE_DIR, 'public/set.html'),
        os.path.join(BASE_DIR, 'public/set.html.bak.v29')
    )
    shutil.copy(
        os.path.join(BASE_DIR, 'public/minifig.html'),
        os.path.join(BASE_DIR, 'public/minifig.html.bak.v29')
    )
    print("  ✓ Backups created (.bak.v29)")
    
    # Patch set.html
    print("[2/4] Patching set.html...")
    patch_set_html()
    print("  ✓ set.html patched")
    
    # Patch minifig.html
    print("[3/4] Patching minifig.html...")
    patch_minifig_html()
    print("  ✓ minifig.html patched")
    
    # Verify
    print("[4/4] Verifying patches...")
    errors = verify_patches()
    
    if errors:
        print()
        print("ERRORS FOUND:")
        for err in errors:
            print(f"  ✗ {err}")
        print()
        print("Rolling back...")
        shutil.copy(
            os.path.join(BASE_DIR, 'public/set.html.bak.v29'),
            os.path.join(BASE_DIR, 'public/set.html')
        )
        shutil.copy(
            os.path.join(BASE_DIR, 'public/minifig.html.bak.v29'),
            os.path.join(BASE_DIR, 'public/minifig.html')
        )
        print("Rolled back to previous version")
        sys.exit(1)
    else:
        print("  ✓ All verifications passed")
    
    print()
    print("=== V30 Frontend Patch SUCCESSFUL ===")
    print()
    print("Changes applied:")
    print("  • set.html: Chart uses user's currency symbol (€/$/£/C$)")
    print("  • minifig.html: API returns symbol based on user's country")
    print()
    print("Test by:")
    print("  1. Open a set detail page → Check chart tooltip")
    print("  2. Open a minifig page → Check chart loads correctly")
    print("  3. Change user country in settings → Refresh page")
    print()
    print("Rollback command:")
    print("  cp public/set.html.bak.v29 public/set.html")
    print("  cp public/minifig.html.bak.v29 public/minifig.html")

if __name__ == '__main__':
    main()
