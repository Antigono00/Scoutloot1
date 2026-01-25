export function roundEur(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parsePrice(priceString: string): number {
  if (!priceString) return 0;
  
  let cleaned = priceString
    .replace(/[€$£]/g, '')
    .replace(/EUR|USD|GBP/gi, '')
    .trim();
  
  if (cleaned.includes(',')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastPeriod = cleaned.lastIndexOf('.');
    
    if (lastPeriod === -1 || lastComma > lastPeriod) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : roundEur(value);
}

export function formatEur(value: number): string {
  return `€${value.toFixed(2)}`;
}

export function calculateTotal(price: number, shipping: number): number {
  return roundEur(price + shipping);
}

/**
 * Calculate total including import charges
 */
export function calculateTotalWithImport(price: number, shipping: number, importCharges: number): number {
  return roundEur(price + shipping + importCharges);
}

export function getPriceBucket(priceEur: number): number {
  return Math.floor(priceEur / 10) * 10;
}
