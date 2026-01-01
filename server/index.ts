import express from 'express';
import cors from 'cors';
import * as storage from './storage.ts';
import * as extractor from './extractor.ts';
import * as queue from './queue.ts';
import { normalizeHost } from './domain.ts';

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Init
storage.initStorage().catch(console.error);

// Async Wrapper
const asyncHandler = (fn: any) => (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// --- ROUTES ---

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '2.0.0' }));

// Settings
app.get('/api/settings', asyncHandler(async (req: any, res: any) => {
    res.json(await storage.getSettings());
}));

app.post('/api/settings', asyncHandler(async (req: any, res: any) => {
    await storage.saveSettings(req.body);
    res.json({ success: true });
}));

// Templates
app.get('/api/templates', asyncHandler(async (req: any, res: any) => {
    res.json(await storage.getTemplates());
}));

app.post('/api/templates', asyncHandler(async (req: any, res: any) => {
    const input = req.body;
    const templates = await storage.getTemplates();
    
    const now = Date.now();
    const doc = {
        id: input.id || Math.random().toString(36).substring(2, 9),
        domain: normalizeHost(input.domain),
        titleSelector: input.titleSelector,
        contentSelector: input.contentSelector,
        removeSelectors: input.removeSelectors || [],
        createdAt: input.createdAt || now,
        updatedAt: now
    };

    const idx = templates.findIndex(t => t.id === doc.id);
    if (idx >= 0) templates[idx] = doc;
    else templates.push(doc);

    await storage.saveTemplates(templates);
    res.json({ success: true, doc });
}));

app.delete('/api/templates/:id', asyncHandler(async (req: any, res: any) => {
    let templates = await storage.getTemplates();
    templates = templates.filter(t => t.id !== req.params.id);
    await storage.saveTemplates(templates);
    res.json({ success: true });
}));

// Extraction
app.post('/api/extract', asyncHandler(async (req: any, res: any) => {
    const { url } = req.body;
    if (!url) throw new Error("URL required");
    const templates = await storage.getTemplates();
    const result = await extractor.extract(url, templates);
    res.json({ success: true, data: result });
}));

app.post('/api/protocol/diagnostics', asyncHandler(async (req: any, res: any) => {
    const { url, domain, titleSelector, contentSelector, removeSelectors } = req.body;
    const result = await extractor.runDiagnostics(url, domain, titleSelector, contentSelector, removeSelectors);
    res.json(result);
}));

// Batch
app.get('/api/batch/status', (req, res) => {
    res.json(queue.getStatus());
});

app.post('/api/batch/add', (req, res) => {
    const { urls } = req.body; // Expect array of strings
    if (Array.isArray(urls)) {
        queue.addItems(urls);
    }
    res.json({ success: true });
});

app.post('/api/batch/start', asyncHandler(async (req: any, res: any) => {
    queue.startProcessing();
    res.json({ success: true });
}));

app.post('/api/batch/stop', (req, res) => {
    queue.stopProcessing();
    res.json({ success: true });
});

app.post('/api/batch/clear', (req, res) => {
    queue.clearQueue();
    res.json({ success: true });
});

app.get('/api/batch/download', asyncHandler(async (req: any, res: any) => {
    const buffer = await queue.createBatchZip();
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', 'attachment; filename=ronin_batch.zip');
    res.send(buffer);
}));

// Error Handler
app.use((err: any, req: any, res: any, next: any) => {
    console.error(err);
    res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
    console.log(`RoninClip Backend running on port ${PORT}`);
});