export function escapeMarkdownV2(text: string): string {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value);
  return 0;
}

// Currency code to symbol mapping
const currencySymbols: Record<string, string> = {
  'EUR': '€',
  'GBP': '£',
  'USD': '$',
  'CAD': 'C$',
  'PLN': 'zł',
  'SEK': 'kr',
  'DKK': 'kr',
  'CZK': 'Kč',
  'HUF': 'Ft',
  'RON': 'lei',
  'BGN': 'лв',
};

function getCurrencySymbol(currency: string | null | undefined): string {
  if (!currency) return '€';
  return currencySymbols[currency.toUpperCase()] || '€';
}

export function formatPrice(amount: unknown, currency?: string | null): string {
  const num = toNumber(amount);
  const symbol = getCurrencySymbol(currency);
  return escapeMarkdownV2(`${symbol}${num.toFixed(2)}`);
}

export function formatLink(text: string, url: string): string {
  const escapedText = escapeMarkdownV2(text);
  const escapedUrl = url.replace(/([)\\])/g, '\\$1');
  return `[${escapedText}](${escapedUrl})`;
}

// Country code to flag emoji mapping
const countryFlags: Record<string, string> = {
  // EU countries
  'DE': '🇩🇪',
  'ES': '🇪🇸',
  'FR': '🇫🇷',
  'IT': '🇮🇹',
  'NL': '🇳🇱',
  'BE': '🇧🇪',
  'AT': '🇦🇹',
  'PL': '🇵🇱',
  'PT': '🇵🇹',
  'SE': '🇸🇪',
  'DK': '🇩🇰',
  'FI': '🇫🇮',
  'GR': '🇬🇷',
  'IE': '🇮🇪',
  'CZ': '🇨🇿',
  'HU': '🇭🇺',
  'RO': '🇷🇴',
  'BG': '🇧🇬',
  'SK': '🇸🇰',
  'HR': '🇭🇷',
  'SI': '🇸🇮',
  'LT': '🇱🇹',
  'LV': '🇱🇻',
  'EE': '🇪🇪',
  'LU': '🇱🇺',
  'MT': '🇲🇹',
  'CY': '🇨🇾',
  
  // UK
  'GB': '🇬🇧',
  'UK': '🇬🇧',
  
  // North America
  'US': '🇺🇸',
  'CA': '🇨🇦',
};

function getCountryFlag(countryCode: string | null | undefined): string {
  if (!countryCode) return '🌍';
  return countryFlags[countryCode.toUpperCase()] || '🌍';
}

/**
 * Get the header text based on notification reason
 */
function getNotificationHeader(reason?: string): string {
  switch (reason) {
    case 'better_deal':
      return '🔥 *BETTER DEAL FOUND\\!*';
    case 'previous_sold':
      return '🔄 *PREVIOUS SOLD \\- NEW BEST*';
    case 'price_drop':
      return '📉 *PRICE DROP\\!*';
    case 'first_notification':
    default:
      return '🧱 *DEAL ALERT*';
  }
}

/**
 * Format import charges for display
 * If estimated, shows ~£X or ~€X ⚠️
 * If actual from eBay, shows £X.XX or €X.XX
 */
function formatImportCharges(amount: number, isEstimate: boolean, currency?: string | null): string {
  if (amount <= 0) return '';
  
  const symbol = getCurrencySymbol(currency);
  
  if (isEstimate) {
    // Round to nearest 5 for estimates to avoid false precision
    const rounded = Math.round(amount / 5) * 5;
    return escapeMarkdownV2(`~${symbol}${rounded}`);
  }
  
  return escapeMarkdownV2(`${symbol}${amount.toFixed(2)}`);
}

export function formatDealAlertMessage(data: {
  setNumber: string;
  setName: string;
  price: unknown;
  shipping: unknown;
  total: unknown;
  target: unknown;
  savings: unknown;
  sellerName: string | null | undefined;
  condition: string;
  listingUrl: string;
  shipFromCountry?: string | null;
  notifyReason?: string;
  // Import charges support
  importCharges?: number;
  importChargesEstimated?: boolean;
  // Currency support (V12)
  currency?: string | null;
}): string {
  const priceNum = toNumber(data.price);
  const shippingNum = toNumber(data.shipping);
  const totalNum = toNumber(data.total);
  const targetNum = toNumber(data.target);
  const savingsNum = toNumber(data.savings);
  const importChargesNum = toNumber(data.importCharges);
  const importChargesEstimated = data.importChargesEstimated ?? false;
  const currency = data.currency || 'EUR';
  
  const savingsPercent = targetNum > 0 ? Math.round((savingsNum / targetNum) * 100) : 0;
  
  const flag = getCountryFlag(data.shipFromCountry);
  const header = getNotificationHeader(data.notifyReason);
  
  // Build the message with MarkdownV2 escaping
  let message = `${header}\n\n`;
  
  message += `*${escapeMarkdownV2(data.setNumber)}* \\- ${escapeMarkdownV2(data.setName)}\n\n`;
  
  message += `💰 *Price:* ${formatPrice(priceNum, currency)}\n`;
  message += `📦 *Shipping:* ${formatPrice(shippingNum, currency)}\n`;
  
  // Show import charges if applicable
  if (importChargesNum > 0) {
    const importDisplay = formatImportCharges(importChargesNum, importChargesEstimated, currency);
    if (importChargesEstimated) {
      message += `🛃 *Import:* ${importDisplay} ⚠️\n`;
    } else {
      message += `🛃 *Import:* ${importDisplay}\n`;
    }
  }
  
  message += `➡️ *Total:* ${formatPrice(totalNum, currency)}\n\n`;
  
  message += `🎯 *Target:* ${formatPrice(targetNum, currency)}\n`;
  message += `✅ *You save:* ${formatPrice(savingsNum, currency)} \\(${savingsPercent}%\\)\n\n`;
  
  message += `📍 *Ships from:* ${flag} ${escapeMarkdownV2(data.shipFromCountry || 'Unknown')}\n`;
  message += `📋 *Condition:* ${escapeMarkdownV2(data.condition)}\n`;
  
  if (data.sellerName) {
    message += `👤 *Seller:* ${escapeMarkdownV2(data.sellerName)}\n`;
  }
  
  // Add note about estimated import charges
  if (importChargesNum > 0 && importChargesEstimated) {
    message += `\n_⚠️ Import charges estimated, actual may vary ±15%_\n`;
  }
  
  // Add the clickable link - this enables Telegram's link preview with the listing image
  message += `\n${formatLink('🔗 View Listing', data.listingUrl)}`;
  
  return message;
}

/**
 * Format a "still available" reminder message
 */
export function formatStillAvailableReminder(data: {
  setNumber: string;
  setName: string;
  price: number;
  targetPrice: number;
  daysAvailable: number;
  listingUrl: string;
  currency?: string | null;
}): string {
  const currency = data.currency || 'EUR';
  const savings = data.targetPrice - data.price;
  const savingsPercent = Math.round((savings / data.targetPrice) * 100);
  
  let message = `💡 *Reminder: Deal Still Available*\n\n`;
  
  message += `The *${escapeMarkdownV2(data.setNumber)}* \\- ${escapeMarkdownV2(data.setName)} `;
  message += `at *${formatPrice(data.price, currency)}* is still available after ${data.daysAvailable} days\\!\n\n`;
  
  message += `💰 You'd save: ${formatPrice(savings, currency)} \\(${savingsPercent}%\\)\n\n`;
  
  message += `_This is ${savingsPercent}% below your target\\._\n\n`;
  
  message += `${formatLink('🔗 View Listing', data.listingUrl)}\n\n`;
  
  message += `_Disable reminders in Settings if you're not interested\\._`;
  
  return message;
}

/**
 * Format a message for UK import charge explanation
 */
export function formatUKImportExplanation(): string {
  let message = `🛃 *About UK Import Charges*\n\n`;
  
  message += `When buying from EU sellers to UK:\n`;
  message += `• UK VAT \\(20%\\) applies on item \\+ shipping\n`;
  message += `• Carrier handling fee \\(~£10\\)\n`;
  message += `• No customs duty on most LEGO\n\n`;
  
  message += `When buying from UK sellers to EU:\n`;
  message += `• Your country's VAT applies\n`;
  message += `• Carrier handling fee \\(~€10\\)\n\n`;
  
  message += `_Charges shown with ⚠️ are estimates\\. Actual charges from eBay \\(when available\\) are more accurate\\._`;
  
  return message;
}

/**
 * Format a message for US/CA import charge explanation
 */
export function formatNorthAmericaImportExplanation(): string {
  let message = `🛃 *About US/Canada Import Charges*\n\n`;
  
  message += `*Canada → US:*\n`;
  message += `• Under $800 USD: No duty \\(de minimis\\)\n`;
  message += `• Over $800 USD: ~5% duty \\+ ~$15 handling\n\n`;
  
  message += `*US → Canada:*\n`;
  message += `• GST/HST ~13% on item \\+ shipping\n`;
  message += `• Handling fee ~C$12\n`;
  message += `• Canada de minimis is only C$20\n\n`;
  
  message += `_Note: Sales tax is added by eBay at checkout\\._`;
  
  return message;
}

// Export currency symbol function for use in other modules
export { getCurrencySymbol };
