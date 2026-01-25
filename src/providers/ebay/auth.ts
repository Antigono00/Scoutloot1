import { config } from '../../config.js';
import { EbayTokenResponse } from './types.js';

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';

export async function getEbayToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 5 * 60 * 1000) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${config.ebayClientId}:${config.ebayClientSecret}`
  ).toString('base64');

  const response = await fetch(EBAY_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`eBay OAuth failed (${response.status}): ${errorText}`);
  }

  const data = await response.json() as EbayTokenResponse;
  
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;

  console.log(`eBay token refreshed, expires in ${data.expires_in}s`);

  return cachedToken;
}

export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}
