interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

export async function getAppToken(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid (with 5 minute buffer)
  if (cachedToken && cachedToken.expiresAt > now + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Azure AD configuration');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get token: ${response.status} ${error}`);
  }

  const tokenData: TokenResponse = await response.json();
  
  // Cache the token with expiry time
  cachedToken = {
    token: tokenData.access_token,
    expiresAt: now + (tokenData.expires_in * 1000)
  };

  return cachedToken.token;
}

export async function graphFetch(
  path: string, 
  init?: RequestInit & { needsConsistencyLevel?: boolean }
): Promise<Response> {
  const token = await getAppToken();
  const url = path.startsWith('https://') ? path : `https://graph.microsoft.com${path}`;
  
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...init?.headers,
  };

  // Add ConsistencyLevel header when needed (for search operations)
  if (init?.needsConsistencyLevel) {
    headers['ConsistencyLevel'] = 'eventual';
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  // Handle rate limiting with exponential backoff
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
    
    console.log(`Rate limited, waiting ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return graphFetch(path, init);
  }

  return response;
}