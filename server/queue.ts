
import type { BatchItem, BatchStatus } from '../types.ts';
import * as extractor from './extractor.ts';
import * as storage from './storage.ts';
import * as talevox from './exporters/talevoxExporter.ts';
import { normalizeHost } from './domain.ts';
import AdmZip from 'adm-zip';
import sanitize from 'sanitize-filename';
import { Buffer } from 'buffer';

let queue: BatchItem[] = [];
let isProcessing = false;
let activeWorkers = 0;
let shouldStop = false;

// Token bucket for rate limiting
let tokens = 0;
let lastRefill = Date.now();

export function getStatus(): BatchStatus {
    const completed = queue.filter(i => i.status === 'success').length;
    const failed = queue.filter(i => i.status === 'failed').length;
    return {
        queue,
        isProcessing,
        completedCount: completed,
        failedCount: failed,
        totalCount: queue.length
    };
}

export function addItems(urls: string[], seriesTitle?: string, startIndex?: number) {
    let currentIndex = startIndex || 1;
    
    const newItems = urls.map(url => {
        const item: BatchItem = {
            id: Math.random().toString(36).substring(2, 9),
            url: url.trim(),
            status: 'pending' as const,
        };
        
        // If manual config provided, assign it to the item
        if (seriesTitle) item.manualSeriesTitle = seriesTitle;
        if (startIndex !== undefined) {
            item.manualChapterIndex = currentIndex;
            currentIndex++;
        }

        return item;
    });
    queue.push(...newItems);
}

export function addCompletedItem(url: string, result: any) {
    const item: BatchItem = {
        id: Math.random().toString(36).substring(2, 9),
        url: url.trim(),
        status: 'success',
        result: result
    };
    queue.push(item);
}

export function clearQueue() {
    if (!isProcessing) {
        queue = [];
    }
}

export function retryFailed() {
    if (isProcessing) return;
    queue.forEach(item => {
        if (item.status === 'failed') {
            item.status = 'pending';
            item.error = undefined;
            item.result = undefined;
        }
    });
}

export function updateItemContent(id: string, content: string) {
    const item = queue.find(i => i.id === id);
    if (item && item.result) {
        item.result.content = content;
        // Re-evaluate hasImages
        item.result.hasImages = content.includes('![image](');
    }
}

export async function startProcessing() {
    if (isProcessing) return;
    shouldStop = false;
    isProcessing = true;
    
    const settings = await storage.getSettings();
    const maxConcurrency = settings.concurrency || 1;
    
    // Init tokens
    tokens = settings.rateLimitPerMinute; 
    lastRefill = Date.now();

    // Main loop
    while (!shouldStop) {
        // Refill tokens
        const now = Date.now();
        const elapsed = now - lastRefill;
        if (elapsed > 60000) {
            tokens = settings.rateLimitPerMinute;
            lastRefill = now;
        }

        // Check completion
        const pending = queue.find(i => i.status === 'pending');
        if (!pending && activeWorkers === 0) {
            isProcessing = false;
            break;
        }

        // Spawn worker if allowed
        if (pending && activeWorkers < maxConcurrency && tokens > 0) {
            tokens--;
            activeWorkers++;
            
            // Add a random jitter delay (500ms - 2500ms) to simulate human behavior
            await new Promise(r => setTimeout(r, Math.random() * 2000 + 500));

            processItem(pending).finally(() => {
                activeWorkers--;
            });
        }

        // Wait a bit before next loop tick
        await new Promise(r => setTimeout(r, 200));
    }
    
    isProcessing = false;
}

export function stopProcessing() {
    shouldStop = true;
}

async function processItem(item: BatchItem) {
    item.status = 'processing';
    try {
        const templates = await storage.getTemplates();
        const result = await extractor.extract(item.url, templates);
        item.result = result;
        item.status = 'success';
    } catch (e: any) {
        item.status = 'failed';
        item.error = e.message;
        console.error(`Failed ${item.url}:`, e);
    }
}

function deriveTitleFromUrl(url: string): string {
    try {
        const u = new URL(url);
        const segments = u.pathname.split('/').filter(s => s);
        if (segments.length === 0) return '';
        
        // Take last segment
        let slug = segments[segments.length - 1];
        
        // Remove known numeric prefixes from slug.
        // Matches patterns like "123-title", "7-1-title", "vol-1-ch-2-title" (simplified as numbers)
        // Regex explanation: ^(?:\d+[-_])+ matches "7-1-" or "123-" or "7-1-2-" at start
        slug = slug.replace(/^(?:\d+[-_])+/, '');
        
        // Replace dashes/underscores with spaces
        let title = slug.replace(/[-_]/g, ' ');
        
        // Capitalize Words
        title = title.replace(/\b\w/g, c => c.toUpperCase());
        
        return title.trim();
    } catch (e) {
        return '';
    }
}

export async function createBatchZip(format: string = 'talevox') {
    const zip = new AdmZip();
    
    // FILTER AND SORT
    // Sort by manualChapterIndex if available, otherwise fallback to array order
    const successItems = queue
        .filter(i => i.status === 'success' && i.result)
        .sort((a, b) => {
             if (a.manualChapterIndex && b.manualChapterIndex) {
                 return a.manualChapterIndex - b.manualChapterIndex;
             }
             return queue.indexOf(a) - queue.indexOf(b);
        });

    if (format === 'talevox') {
        // TaleVox Export Logic
        
        let seriesSlug = 'series';
        let seriesTitle = 'Unknown Series';

        if (successItems.length > 0) {
            if (successItems[0].manualSeriesTitle) {
                seriesTitle = successItems[0].manualSeriesTitle;
                seriesSlug = seriesTitle.toLowerCase().trim()
                    .replace(/\s+/g, '_')
                    .replace(/[^a-z0-9_\-]/g, '');
            } else {
                const host = normalizeHost(successItems[0].url);
                seriesSlug = host.replace(/\./g, '_');
                seriesTitle = seriesSlug;
            }
        }

        const manifestItems: Array<{index: number, title: string, filename: string, url: string}> = [];
        const usedFilenames = new Set<string>();
        
        // Tracking index for fallback sequence
        let lastTrackedIndex = 0;
        // If the user provided a manual start index, initialize our tracker behind it
        if (successItems.length > 0 && successItems[0].manualChapterIndex) {
            lastTrackedIndex = successItems[0].manualChapterIndex - 1;
        }

        successItems.forEach((item, idx) => {
            if (!item.result) return;
            
            const meta = talevox.parseChapterMetadata(item.result.title);
            let index = 0;

            // PRIORITY 1: Manual Index (Meta column in UI)
            if (item.manualChapterIndex !== undefined) {
                index = item.manualChapterIndex;
            } 
            // PRIORITY 2: Parsed Metadata (if no manual override)
            else if (meta.index !== null) {
                index = meta.index;
            } 
            // PRIORITY 3: Fallback increment
            else {
                index = Math.floor(lastTrackedIndex) + 1;
            }
            
            lastTrackedIndex = index;

            // Resolve Clean Title
            let finalTitle = meta.title;

            // FALLBACK: If title is empty (H1 was just "Chapter X"), try URL slug
            if (!finalTitle && item.url) {
                const slugTitle = deriveTitleFromUrl(item.url);
                if (slugTitle.length > 2) {
                    finalTitle = slugTitle;
                }
            }

            // Auto-detect extension
            const ext = item.result.hasRichContent ? '.md' : '.txt';

            // Generate filename
            let filename = talevox.buildFilename(seriesSlug, index, finalTitle).replace('.txt', ext);
            
            // Handle duplicates
            let version = 2;
            while(usedFilenames.has(filename)) {
                filename = filename.replace(ext, `__v${version}${ext}`);
                version++;
            }
            usedFilenames.add(filename);

            // Generate Content
            const content = talevox.formatChapterContent(index, finalTitle, item.result.content);
            
            zip.addFile(filename, Buffer.from(content, 'utf8'));
            
            manifestItems.push({
                index,
                title: finalTitle || `Chapter ${index}`, 
                filename,
                url: item.url
            });
        });

        const manifestJson = talevox.generateManifest(seriesTitle, seriesSlug, manifestItems);
        zip.addFile('talevox_manifest.json', Buffer.from(manifestJson, 'utf8'));

    } else {
        // Generic Export Logic
        successItems.forEach(item => {
            if (item.result) {
                const ext = item.result.hasRichContent ? '.md' : '.txt';
                const safeTitle = sanitize(item.result.title).substring(0, 100);
                const content = `${item.result.title}\n\n${item.result.content}`;
                zip.addFile(`${safeTitle}${ext}`, Buffer.from(content, 'utf8'));
            }
        });

        // Generic manifest
        const manifest = {
            generatedAt: new Date().toISOString(),
            total: successItems.length,
            items: successItems.map(i => {
                const ext = i.result?.hasRichContent ? '.md' : '.txt';
                return {
                    url: i.url,
                    title: i.result?.title,
                    filename: `${sanitize(i.result?.title || '')}${ext}`
                };
            })
        };
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    }

    return zip.toBuffer();
}
