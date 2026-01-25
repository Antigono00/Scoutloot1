import { getEbayToken } from './dist/providers/ebay/auth.js';

async function checkLimits() {
  const token = await getEbayToken();
  
  const response = await fetch('https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_name=browse&api_context=buy', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

checkLimits();
