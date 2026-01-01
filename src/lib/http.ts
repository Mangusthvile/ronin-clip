// Determine API base URL based on the current port.
// In Dev (Vite default port 5173), we hit the backend explicitly at 8787.
// In Prod (Express serving static files at 8787), we use relative paths.
const isDev = typeof window !== 'undefined' && window.location.port !== '8787';
export const API_BASE = isDev ? 'http://localhost:8787' : '';

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  
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
    if (error.message === 'Failed to fetch') {
      throw new Error('Connection to backend failed. Check port 8787.');
    }
    throw error;
  }
}