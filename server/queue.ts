import type { BatchItem, BatchStatus } from '../types.ts';
import * as extractor from './extractor.ts';
import * as storage from './storage.ts';
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

export function addItems(urls: string[]) {
    const newItems = urls.map(url => ({
        id: Math.random().toString(36).substring(2, 9),
        url: url.trim(),
        status: 'pending' as const
    }));
    queue.push(...newItems);
}

export function clearQueue() {
    if (!isProcessing) {
        queue = [];
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

export async function createBatchZip() {
    const zip = new AdmZip();
    const successItems = queue.filter(i => i.status === 'success' && i.result);
    
    // Add text files
    successItems.forEach(item => {
        if (item.result) {
            const safeTitle = sanitize(item.result.title).substring(0, 100);
            const content = `${item.result.title}\n\n${item.result.content}`;
            zip.addFile(`${safeTitle}.txt`, Buffer.from(content, 'utf8'));
        }
    });

    // Add manifest
    const manifest = {
        generatedAt: new Date().toISOString(),
        total: successItems.length,
        items: successItems.map(i => ({
            url: i.url,
            title: i.result?.title,
            filename: `${sanitize(i.result?.title || '')}.txt`
        }))
    };
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

    return zip.toBuffer();
}