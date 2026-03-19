// Determine API base URL based on the current port.
// We use relative paths so that the Vite proxy (configured in vite.config.ts)
// can forward requests to http://127.0.0.1:8787 correctly.
// This resolves CORS issues and localhost resolution (IPv4 vs IPv6) problems.
export const API_BASE = '';

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  // Ensure consistent slash handling
  const path = url.startsWith('/') ? url : `/${url}`;
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${path}`;
  
  try {
    const res = await fetch(fullUrl, init);
    const text = await res.text();

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = text ? JSON.parse(text) : null;
        if (j?.error) msg = j.error;
        else if (j?.message) msg = j.message;
      } catch {}
      throw new Error(msg);
    }

    if (!text.trim()) {
       return {} as T; 
    }

    try {
        return JSON.parse(text) as T;
    } catch(e) {
        throw new Error(`Invalid JSON response`);
    }
  } catch (error: any) {
    // If the proxy is down or we can't reach the dev server
    if (error.message === 'Failed to fetch') {
      throw new Error('Connection to backend failed. Check port 8787.');
    }
    throw error;
  }
}