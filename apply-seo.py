#!/usr/bin/env python3
"""
ScoutLoot SEO Optimization Script
Run on server: python3 apply-seo.py
"""

import re
import shutil
from datetime import datetime

# Paths
INDEX_FILE = '/var/www/scoutloot/app/public/index.html'

# New optimized head content
NEW_HEAD = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Primary SEO -->
  <title>LEGO Deal Alerts & Price Tracker | ScoutLoot - USA, UK, Europe</title>
  <meta name="description" content="Free LEGO deal alerts & price tracker. Get instant notifications when LEGO sets hit your target price on eBay. Track deals in USA, Canada, UK & Europe. Never miss a LEGO bargain!">
  <meta name="keywords" content="LEGO deal alerts, LEGO price tracker, LEGO deals, eBay LEGO, cheap LEGO sets, LEGO price alerts, LEGO bargains, LEGO discount finder">
  <meta name="author" content="ScoutLoot">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="https://scoutloot.com/">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://scoutloot.com/">
  <meta property="og:title" content="LEGO Deal Alerts & Price Tracker | ScoutLoot">
  <meta property="og:description" content="Free LEGO price alerts. Set your target price, get instant notifications when deals drop on eBay. USA, Canada, UK & Europe.">
  <meta property="og:image" content="https://scoutloot.com/og-image.png">
  <meta property="og:site_name" content="ScoutLoot">
  <meta property="og:locale" content="en_US">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="https://scoutloot.com/">
  <meta name="twitter:title" content="LEGO Deal Alerts & Price Tracker | ScoutLoot">
  <meta name="twitter:description" content="Free LEGO price alerts. Get notified when sets hit your target price on eBay.">
  <meta name="twitter:image" content="https://scoutloot.com/og-image.png">
  
  <!-- PWA Manifest -->
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#0A0A0F">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="ScoutLoot">
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  
  <!-- Favicon -->
  <link rel="icon" href="/favicon.ico" type="image/x-icon">
  <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">
  <link rel="apple-touch-icon" href="/icon-192.png">
  
  <!-- Structured Data - WebApplication -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "ScoutLoot",
    "alternateName": "LEGO Deal Alerts",
    "description": "LEGO deal alerts and price tracker. Get instant notifications when LEGO sets hit your target price on eBay.",
    "url": "https://scoutloot.com",
    "applicationCategory": "ShoppingApplication",
    "operatingSystem": "Web Browser",
    "browserRequirements": "Requires JavaScript",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "description": "Free tier available"
    },
    "featureList": [
      "LEGO price alerts",
      "eBay deal tracking", 
      "Telegram notifications",
      "Push notifications",
      "USA, Canada, UK & Europe support",
      "Multi-currency tracking"
    ]
  }
  </script>
  
  <!-- Structured Data - Organization -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ScoutLoot",
    "url": "https://scoutloot.com",
    "logo": "https://scoutloot.com/icon-512.png",
    "description": "LEGO deal alerts and price tracking service"
  }
  </script>
  
  <!-- Styles -->
  <link rel="stylesheet" href="/css/styles.css">
</head>'''

def main():
    print("🔧 ScoutLoot SEO Optimization")
    print("=" * 40)
    
    # Read current file
    with open(INDEX_FILE, 'r') as f:
        content = f.read()
    
    # Create backup
    backup_name = f"{INDEX_FILE}.backup-seo-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    shutil.copy(INDEX_FILE, backup_name)
    print(f"✅ Backup created: {backup_name}")
    
    # Find and replace head section
    # Match from <!DOCTYPE to </head>
    pattern = r'<!DOCTYPE html>.*?</head>'
    
    if re.search(pattern, content, re.DOTALL):
        new_content = re.sub(pattern, NEW_HEAD, content, flags=re.DOTALL)
        
        # Write updated file
        with open(INDEX_FILE, 'w') as f:
            f.write(new_content)
        
        print("✅ Head section replaced with SEO-optimized version")
        print()
        print("Changes made:")
        print("  • Title: 'LEGO Deal Alerts & Price Tracker | ScoutLoot'")
        print("  • Meta description: Keyword-rich, ~155 chars")
        print("  • Meta keywords: Added")
        print("  • Canonical URL: Added")
        print("  • OG tags: Updated with keywords")
        print("  • Twitter tags: Updated with keywords")
        print("  • JSON-LD: WebApplication + Organization schema")
        print()
        print("Next steps:")
        print("  1. Go to Google Search Console")
        print("  2. URL Inspection > Enter: https://scoutloot.com")
        print("  3. Click 'Request Indexing'")
        print("  4. Submit sitemap if not already done")
        print("  5. Wait 3-7 days for Google to update")
    else:
        print("❌ Could not find head section pattern")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
