
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { normalizeHost } from './domain.ts';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ProtocolTemplate, DiagnosticResult } from '../types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DATA_DIR = path.join(__dirname, '..', 'data', 'browser_session_v3');
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const BR_TOKEN = '[[__BR__]]';

const STEALTH_INJECTION = `
  delete Object.getPrototypeOf(navigator).webdriver;
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  if (!window.chrome) { window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} }; }
  if (navigator.permissions) {
    const originalQuery = navigator.permissions.query;
    navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ? Promise.resolve({ state: 'denied' }) : originalQuery(parameters)
    );
  }
  Object.defineProperty(navigator, 'plugins', {
    get: () => { const p = [1, 2, 3, 4, 5]; p.item = () => {}; p.namedItem = () => {}; return p; },
  });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
`;

function cleanText(text: string): string {
  if (!text) return '';
  let t = text.replace(/[\r\n\t]+/g, ' ');
  t = t.replace(/\s+/g, ' ');
  t = t.split(BR_TOKEN).join('\n');
  return t.trim();
}

function cleanupHeader(paras: string[], title: string): string[] {
    let lines = [...paras];
    const t = cleanText(title).toLowerCase();
    let checkLimit = 8;
    while (lines.length > 0 && checkLimit > 0) {
        checkLimit--;
        const line = cleanText(lines[0]);
        const lowLine = line.toLowerCase();
        
        const isTitle = lowLine === t || (t.length > 5 && lowLine.includes(t)) || (lowLine.length > 5 && t.includes(lowLine));
        if (isTitle) { lines.shift(); continue; }

        const isDate = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.]+\d{1,2}(?:st|nd|rd|th)?[\s,.]+\d{4}/i.test(line) || /\d{4}[\-./]\d{2}[\-./]\d{2}/.test(line);
        if (isDate) { lines.shift(); continue; }

        const isMetadata = line.length < 60 && !/[.!?]["']?$/.test(line) && !/^["“'‘]/.test(line) && /[a-z]/i.test(line) && !line.includes('“') && !line.includes('"');
        if (isMetadata) { lines.shift(); continue; }

        if (/^(posted|written|published) by/i.test(line)) { lines.shift(); continue; }
        break;
    }
    return lines;
}

function cleanupFooter(paras: string[], title: string): string[] {
    let lines = [...paras];
    const t = cleanText(title).toLowerCase();
    let checkLimit = 10;
    while (lines.length > 0 && checkLimit > 0) {
        checkLimit--;
        const lastIndex = lines.length - 1;
        const line = cleanText(lines[lastIndex]);
        const lowLine = line.toLowerCase();

        const isTitle = lowLine === t || (t.length > 5 && lowLine.includes(t)) || (lowLine.length > 5 && t.includes(lowLine));
        if (isTitle) { lines.pop(); continue; }

        const isDate = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.]+\d{1,2}(?:st|nd|rd|th)?[\s,.]+\d{4}/i.test(line) || /\d{4}[\-./]\d{2}[\-./]\d{2}/.test(line);
        if (isDate) { lines.pop(); continue; }

        const isMetadata = line.length < 60 && !/[.!?]["']?$/.test(line) && !/^["“'‘]/.test(line) && /[a-z]/i.test(line) && !line.includes('“') && !line.includes('"');
        if (isMetadata) { lines.pop(); continue; }

        if (/^(next|previous|prev) (chapter|part|episode)|(share|like|comment)/i.test(line)) { lines.pop(); continue; }
        break;
    }
    return lines;
}

function postProcessBody(body: string): string {
    let lines = body.split('\n').map(l => l.trim());
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function createMarkdownTable(headers: string[], rows: string[][]): string {
    if (headers.length === 0 && rows.length === 0) return '';
    let out = '';
    let maxCols = headers.length;
    rows.forEach(r => maxCols = Math.max(maxCols, r.length));
    while (headers.length < maxCols) headers.push('');
    if (headers.length > 0) {
        out += '| ' + headers.join(' | ') + ' |\n';
        out += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
    } else if (rows.length > 0) {
        const first = rows.shift();
        if (first) {
             while (first.length < maxCols) first.push('');
             out += '| ' + first.join(' | ') + ' |\n';
             out += '| ' + first.map(() => '---').join(' | ') + ' |\n';
        }
    }
    rows.forEach(row => {
        while (row.length < maxCols) row.push('');
        out += '| ' + row.map(cell => cell.replace(/\|/g, '\\|').replace(/\n/g, '<br>')).join(' | ') + ' |\n';
    });
    return out;
}

function parseCookies(url: string, cookieString: string) {
    try {
        const u = new URL(url);
        return cookieString.split(';').map(part => {
                const [key, ...vals] = part.trim().split('=');
                if(!key) return null;
                return { name: key, value: vals.join('='), domain: u.hostname, path: '/' };
            }).filter(c => c !== null) as Array<{name: string, value: string, domain: string, path: string}>;
    } catch (e) {
        console.error("Cookie parse error", e);
        return [];
    }
}

async function fetchPlaywright(url: string, headless: boolean, waitForSelector?: string, cookies?: string, userAgent?: string): Promise<string> {
    const ua = userAgent || DEFAULT_USER_AGENT;
    const args = [
        '--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-infobars', '--window-position=0,0', '--disable-extensions',
    ];

    let browser = null, context = null, page = null;
    try {
        if (headless) {
             browser = await chromium.launch({ headless: true, args, ignoreDefaultArgs: ['--enable-automation'] });
             const domain = new URL(url).origin;
             context = await browser.newContext({
                userAgent: ua, viewport: { width: 1920, height: 1080 }, locale: 'en-US',
                deviceScaleFactor: 1, timezoneId: 'America/New_York', javaScriptEnabled: true,
                extraHTTPHeaders: { 'Referer': domain, 'Origin': domain }
             });
        } else {
             console.log(`[Tier 3] Launching Persistent Context at: ${USER_DATA_DIR}`);
             const launchOptions: any = { headless: false, args, viewport: null, ignoreDefaultArgs: ['--enable-automation'], locale: 'en-US' };
             if (userAgent && userAgent !== DEFAULT_USER_AGENT) launchOptions.userAgent = userAgent;
             context = await chromium.launchPersistentContext(USER_DATA_DIR, launchOptions);
        }

        await context.addInitScript(STEALTH_INJECTION);
        if (cookies) {
            const cookieList = parseCookies(url, cookies);
            if (cookieList.length > 0) await context.addCookies(cookieList);
        }

        page = headless ? await context.newPage() : (context.pages()[0] || await context.newPage());
        if (headless) await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2}', route => route.abort());
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

        if (!headless) {
            try { await page.mouse.move(100, 100); await page.waitForTimeout(200); await page.mouse.move(200, 200, { steps: 10 }); await page.mouse.wheel(0, 100); } catch (e) {}
        }

        if (waitForSelector) {
            try {
                // CHANGED: Increased headless timeout to 30s and post-found wait to 3000ms
                const timeout = headless ? 30000 : 60000;
                await page.waitForSelector(waitForSelector, { state: 'attached', timeout });
                await page.waitForTimeout(3000); // Wait for hydration/rendering of text
            } catch (e) {
                if (headless) throw new Error(`Timeout waiting for selector: ${waitForSelector}`);
                console.warn(`Headful timeout for ${waitForSelector}, grabbing current content anyway.`);
            }
        } else { await page.waitForTimeout(2000); }

        const content = await page.content();
        if (headless && browser) await browser.close();
        if (!headless && context) await context.close(); 
        return content;
    } catch (e: any) {
        if (headless && browser) await browser.close();
        if (!headless && context) await context.close();
        throw e;
    }
}

async function fetchHtml(url: string, waitForSelector?: string, cookies?: string, userAgent?: string): Promise<string> {
    try { return await fetchPlaywright(url, true, waitForSelector, cookies, userAgent); }
    catch (e: any) {
        console.warn(`Headless fetch failed for ${url}: ${e.message}. Retrying with headful...`);
        try { return await fetchPlaywright(url, false, waitForSelector, cookies, userAgent); }
        catch (e2: any) { throw new Error(`Failed to fetch ${url}. \nHeadless: ${e.message}\nHeadful: ${e2.message}`); }
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
    const html = await fetchHtml(url, protocol ? protocol.contentSelector : undefined, protocol?.cookies, protocol?.userAgent);
    const $ = cheerio.load(html);

    let title = '';
    let body = '';
    let hasRichContent = false;
    // DEBUG INFO
    const debugMetadata: any = { usedSelector: '', titleSelector: '', removedElements: [] };

    if (protocol) {
        let $root = null;
        try {
            const selectors = protocol.contentSelector.split(',').map(s => s.trim());
            for (const s of selectors) {
                const found = $(s).first();
                if (found.length > 0) {
                    $root = found;
                    debugMetadata.usedSelector = s; // Log which selector matched
                    break; 
                }
            }
        } catch (e) { throw new Error(`Invalid content selector: ${protocol.contentSelector}`); }

        if (!$root || $root.length === 0) { throw new Error(`Content selector '${protocol.contentSelector}' matched 0 elements.`); }

        // REMOVALS
        const generalRemovals = ['script', 'style', 'iframe', 'noscript', 'svg', 'form', 'div[id^="pf-"]', '[style*="display: none"]', '[style*="display:none"]', '[aria-hidden="true"]', '[hidden]', '.hidden'];
        generalRemovals.forEach(sel => $(sel).remove());

        if (protocol.removeSelectors) {
             protocol.removeSelectors.forEach(sel => {
                 try {
                     if (sel && sel.trim()) {
                         const count = $(sel).length;
                         if (count > 0) debugMetadata.removedElements.push(`${sel} (${count})`);
                         $(sel).remove();
                     }
                 } catch (e) {}
             });
        }

        try {
            const $title = $(protocol.titleSelector).first();
            title = cleanText($title.text());
            debugMetadata.titleSelector = protocol.titleSelector;
        } catch (e) {}

        // 1. Fallback to <title> if empty
        if (!title) {
            const pageTitle = $('title').text();
            if (pageTitle) {
                title = cleanText(pageTitle);
                // Cleanup common suffixes
                title = title.replace(/\s*\|\s*Patreon$/i, '')
                            .replace(/\s*-\s*Royal Road$/i, '')
                            .replace(/\s*\|\s*Scribble Hub$/i, '')
                            .replace(/\s*\|\s*Ranobes$/i, '');
                debugMetadata.titleSelector = 'fallback: <title> tag';
            }
        }

        // 2. Final fallback: H1
        if (!title) {
            const h1 = $('h1').first();
            if (h1.length > 0) {
                title = cleanText(h1.text());
                debugMetadata.titleSelector = 'fallback: h1';
            }
        }

        const paras: string[] = [];
        $root.find('br').replaceWith(` ${BR_TOKEN} `); 

        const blockTags = ['p', 'div', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'article', 'section', 'table', 'img'];
        const selector = blockTags.join(', ');

        $root.find(selector).each((_, el) => {
            const $el = $(el);
            const tagName = el.tagName.toLowerCase();
            
            if (tagName === 'img') {
                if ($el.parents('table').length > 0) return;
                const src = $el.attr('src') || $el.attr('data-src');
                if (src) {
                    paras.push(`![image](${src})`);
                    hasRichContent = true;
                    debugMetadata.hasImages = true;
                }
                return;
            }

            if (tagName === 'table') {
                 if ($el.parents('table').length > 0) return;
                 const rows: string[][] = [];
                 const headers: string[] = [];
                 $el.find('th').each((_, th) => headers.push(cleanText($(th).text())));
                 $el.find('tr').each((_, tr) => {
                     const cells: string[] = [];
                     const $tr = $(tr);
                     if ($tr.find('th').length > 0 && $tr.find('td').length === 0) return;
                     $tr.find('td').each((_, td) => {
                         const $td = $(td);
                         $td.find('p, div, li, h1, h2, h3, h4, h5').after(BR_TOKEN);
                         cells.push(cleanText($td.text()));
                     });
                     if (cells.length > 0) rows.push(cells);
                 });
                 paras.push(createMarkdownTable(headers, rows));
                 hasRichContent = true;
                 return;
            }

            if (tagName === 'blockquote') {
                if ($el.parents('table').length > 0) return;
                paras.push(`> ${cleanText($el.text())}`);
                hasRichContent = true;
                return;
            }

            if ($el.parents('table').length > 0) return;
            if ($el.find(selector).length > 0) return;

            const t = cleanText($el.text());
            if (t) paras.push(t);
        });

        const cleanedParas = cleanupHeader(paras, title);
        const fullyCleanedParas = cleanupFooter(cleanedParas, title);

        if (fullyCleanedParas.length === 0) {
            const raw = cleanText($root.text());
            body = raw.startsWith(title) ? raw.substring(title.length).trim() : raw;
        } else {
            body = fullyCleanedParas.join('\n\n');
        }

    } else {
        $('script, style, iframe, noscript').remove();
        $('br').replaceWith(` ${BR_TOKEN} `);
        const titleEl = $('h1').first();
        title = cleanText(titleEl.text());
        
        // Fallback for generic extraction too
        if (!title) {
            const pageTitle = $('title').text();
            if (pageTitle) title = cleanText(pageTitle);
        }

        const paras: string[] = [];
        $('p, div, blockquote, td, li').each((_, el) => {
             const $el = $(el);
             if ($el.find('p, div, blockquote, td, li').length > 0) return;
             const t = cleanText($el.text());
             if (t && t.length > 10) paras.push(t);
        });
        body = paras.join('\n\n');
        if (!body) throw new Error("No protocol found and auto-extraction failed.");
    }

    return {
        title,
        content: postProcessBody(body),
        url,
        matchedProtocol: protocol?.domain,
        hasRichContent,
        hasImages: debugMetadata.hasImages || false,
        debugMetadata // Passing this back
    };
}

export async function runDiagnostics(
    url: string, 
    domain: string, 
    titleSelector: string, 
    contentSelector: string, 
    removalSelectors: string[] = [],
    cookies?: string,
    userAgent?: string
): Promise<DiagnosticResult> {
    const html = await fetchHtml(url, contentSelector, cookies, userAgent);
    const $ = cheerio.load(html);
    const host = normalizeHost(url);

    $('script, style, iframe, noscript').remove();
    $('div[id^="pf-"]').remove();
    $('br').replaceWith(` ${BR_TOKEN} `);
    removalSelectors.forEach(s => { try { if(s.trim()) $(s).remove(); } catch (e) {} });

    let contentMatches = 0;
    let titleMatches = 0;
    let titleText = '';
    let pCount = 0;
    const paras: string[] = [];

    try {
        const $root = $(contentSelector).first();
        contentMatches = $root.length;
        if (contentMatches > 0) {
            const blockTags = ['p', 'div', 'blockquote', 'h1', 'h2', 'li', 'table'];
            const selector = blockTags.join(', ');
            $root.find(selector).each((_, el) => {
                const $el = $(el);
                if (el.tagName.toLowerCase() === 'table') {
                    if ($el.parents('table').length > 0) return;
                    paras.push("[TABLE/BOX DETECTED]");
                    pCount++;
                    return;
                }
                if ($el.find(selector).length > 0) return;
                if ($el.parents('table').length > 0) return;
                const t = cleanText($el.text());
                if (t) { paras.push(t); pCount++; }
            });
        }
    } catch (e) { return { host, titleMatches: 0, contentMatches: 0, paragraphCount: 0, titlePreview: '', contentPreview: '', error: `Invalid Content Selector` }; }

    try {
        const $title = $(titleSelector).first();
        titleMatches = $title.length;
        titleText = cleanText($title.text());
    } catch (e) { return { host, titleMatches: 0, contentMatches, paragraphCount: 0, titlePreview: '', contentPreview: '', error: `Invalid Title Selector` }; }

    let bodyPreview = '';
    if (paras.length > 0) {
        if (paras[0] === titleText) paras.shift();
        bodyPreview = paras.join('\n\n');
    } else { try { bodyPreview = cleanText($(contentSelector).first().text()); } catch {} }

    return { host, titleMatches, contentMatches, paragraphCount: pCount, titlePreview: titleText.substring(0, 120), contentPreview: bodyPreview.substring(0, 120), };
}
