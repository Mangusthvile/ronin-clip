import { URL } from 'url';

export function normalizeHost(input: string): string {
  if (!input) return '';
  let host = input.toLowerCase().trim();

  // If it doesn't have protocol, might be just a domain, try adding https:// to parse
  if (!host.startsWith('http://') && !host.startsWith('https://')) {
    // Check if it looks like a url "example.com/foo"
    if (host.includes('/')) {
       host = 'https://' + host;
    }
  }

  try {
    // Try parsing as URL
    const urlObj = new URL(host);
    host = urlObj.hostname;
  } catch (e) {
    // If fail, assume it is just a domain string already
  }

  // Strip www.
  if (host.startsWith('www.')) {
    host = host.substring(4);
  }

  return host;
}