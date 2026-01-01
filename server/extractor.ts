import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { normalizeHost } from './domain.ts';
import type { ProtocolTemplate, DiagnosticResult, AppSettings } from '../types.ts';

// Standardized cleanup function
function cleanText(text: string): string {
  if (!text) return '';
  // Normalize whitespace, collapse multiple newlines
  let t = text.replace(/\s+/g, ' ').trim(); 
  return t;
}

function postProcessBody(body: string): string {
    return body
        .replace(/\r\n/g, '\n') // CRLF -> LF
        .replace(/\n{3,}/g, '\n\n') // Collapse 3+ newlines
        .trim();
}

export async function fetchHtml(url: string, waitForSelector?: string): Promise<string> {
    // 1. Try basic fetch first (faster)
    try {
        const res = await fetch(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            } 
        });

        if (res.status === 403 || res.status === 429 || res.status === 503) {
            throw new Error(`Blocked/RateLimited: ${res.status}`);
        }
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const html = await res.text();

        // 2. Validate Static Content
        // If we expect a selector, check if it exists in the static HTML. 
        // If not, it's likely a SPA or protected by JS challenge -> throw to trigger fallback.
        if (waitForSelector) {
            const $ = cheerio.load(html);
            if ($(waitForSelector).length === 0) {
                 // Check if it's a Cloudflare challenge page
                 if (html.includes('Just a moment') || html.includes('Enable JavaScript')) {
                     throw new Error("Cloudflare challenge detected");
                 }
                 throw new Error(`Selector '${waitForSelector}' not found in static response (needs JS?)`);
            }
        }

        return html;

    } catch (e: any) {
        console.log(`Static fetch failed for ${url} (Reason: ${e.message}). Switching to Playwright.`);
        
        // 3. Playwright Fallback
        const browser = await chromium.launch({ headless: true });
        try {
            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 720 }
            });

            const page = await context.newPage();
            
            // Block media to speed up
            await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2}', route => route.abort());

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            if (waitForSelector) {
                try { 
                    await page.waitForSelector(waitForSelector, { state: 'attached', timeout: 15000 }); 
                } catch (err) {
                    console.warn(`Playwright timed out waiting for selector: ${waitForSelector}`);
                }
            }
            
            const content = await page.content();
            return content;
        } catch (pwError: any) {
            throw new Error(`Extraction failed: ${pwError.message}`);
        } finally {
            await browser.close();
        }
    }
}

export function findProtocol(url: string, templates: ProtocolTemplate[]): ProtocolTemplate | undefined {
    const host = normalizeHost(url);
    return templates.find(t => {
        const tHost = normalizeHost(t.domain);
        return host === tHost || host.endsWith('.' + tHost);
    });
}

export async function extract(url: string, templates: ProtocolTemplate[]) {
    const protocol = findProtocol(url, templates);
    const html = await fetchHtml(url, protocol ? protocol.contentSelector : undefined);
    const $ = cheerio.load(html);

    let title = '';
    let body = '';

    if (protocol) {
        // 1. Root
        const $root = $(protocol.contentSelector).first();
        if ($root.length === 0) {
            throw new Error(`Content selector '${protocol.contentSelector}' matched 0 elements.`);
        }

        // 2. Cleanup
        // Global cleanup on the document to ensure nth-child works as expected
        $('script, style, iframe, noscript').remove();
        $('div[id^="pf-"]').remove(); 
        if (protocol.removeSelectors) {
             protocol.removeSelectors.forEach(sel => $(sel).remove());
        }

        // 3. Title
        const $title = $(protocol.titleSelector).first();
        title = cleanText($title.text());

        // 4. Body Paragraphs
        const paras: string[] = [];
        $root.find('p').each((_, el) => {
            const t = cleanText($(el).text());
            if (t) paras.push(t);
        });

        // 5. Remove dup title
        if (paras.length > 0 && paras[0] === title) {
            paras.shift();
        }

        // Fallback if no P tags
        if (paras.length === 0) {
            const raw = cleanText($root.text());
            if (raw.startsWith(title)) {
                body = raw.substring(title.length).trim();
            } else {
                body = raw;
            }
        } else {
            body = paras.join('\n\n');
        }

    } else {
        // Heuristic / Auto Mode fallback
        $('script, style, iframe, noscript').remove();
        const titleEl = $('h1').first();
        title = cleanText(titleEl.text());
        
        const paras: string[] = [];
        $('p').each((_, el) => {
             const t = cleanText($(el).text());
             if (t && t.length > 20) paras.push(t);
        });
        body = paras.join('\n\n');
        if (!body) throw new Error("No protocol found and auto-extraction failed.");
    }

    return {
        title,
        content: postProcessBody(body),
        url,
        matchedProtocol: protocol?.domain
    };
}

export async function runDiagnostics(
    url: string, 
    domain: string, 
    titleSelector: string, 
    contentSelector: string, 
    removalSelectors: string[] = []
): Promise<DiagnosticResult> {
    const html = await fetchHtml(url, contentSelector);
    
    const $ = cheerio.load(html);
    const host = normalizeHost(url);

    // CLEANUP FIRST (Matching the logic in extract)
    // This ensures that nth-child selectors work on the visual DOM, not the dirty DOM.
    $('script, style, iframe, noscript').remove();
    $('div[id^="pf-"]').remove();
    removalSelectors.forEach(s => {
        if(s.trim()) $(s).remove();
    });

    // Check matches AFTER cleanup
    const $root = $(contentSelector).first();
    const contentMatches = $root.length;
    
    const $title = $(titleSelector).first();
    const titleMatches = $title.length;
    const titleText = cleanText($title.text());

    let pCount = 0;
    const paras: string[] = [];
    
    // We can use $root directly now since we cleaned the main DOM
    $root.find('p').each((_, el) => {
        const t = cleanText($(el).text());
        if (t) {
            paras.push(t);
            pCount++;
        }
    });

    let bodyPreview = '';
    if (paras.length > 0) {
        if (paras[0] === titleText) paras.shift();
        bodyPreview = paras.join('\n\n');
    } else {
        bodyPreview = cleanText($root.text());
    }

    return {
        host,
        titleMatches,
        contentMatches,
        paragraphCount: pCount,
        titlePreview: titleText.substring(0, 120),
        contentPreview: bodyPreview.substring(0, 120),
    };
}