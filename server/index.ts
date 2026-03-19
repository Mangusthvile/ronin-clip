import express from 'express';
import cors from 'cors';
import * as storage from './storage.ts';
import * as extractor from './extractor.ts';
import * as queue from './queue.ts';
import { normalizeHost } from './domain.ts';
import { createServer as createViteServer } from 'vite';
import path from 'path';

async function startServer() {
const app = express();
const PORT = process.env.PORT || 3000;

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

// Get list of defaults (Library)
app.get('/api/templates/defaults', (req, res) => {
    res.json(storage.getDefaultTemplates());
});

// Force seed defaults (legacy/maintenance)
app.post('/api/templates/defaults', asyncHandler(async (req: any, res: any) => {
    await storage.seedDefaults();
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
        cookies: input.cookies,
        userAgent: input.userAgent,
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
    
    // Add to batch queue so it shows up in Scrolls if it has images
    if (result.hasImages) {
        queue.addCompletedItem(url, result);
    }

    res.json({ success: true, data: result });
}));

app.post('/api/protocol/diagnostics', asyncHandler(async (req: any, res: any) => {
    const { url, domain, titleSelector, contentSelector, removeSelectors, cookies, userAgent } = req.body;
    const result = await extractor.runDiagnostics(url, domain, titleSelector, contentSelector, removeSelectors, cookies, userAgent);
    res.json(result);
}));

// Batch
app.get('/api/batch/status', (req, res) => {
    res.json(queue.getStatus());
});

app.post('/api/batch/add', (req, res) => {
    const { urls, seriesTitle, startIndex } = req.body; 
    if (Array.isArray(urls)) {
        queue.addItems(urls, seriesTitle, startIndex);
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

app.post('/api/batch/update/:id', (req, res) => {
    const { content } = req.body;
    queue.updateItemContent(req.params.id, content);
    res.json({ success: true });
});

app.post('/api/transmute', asyncHandler(async (req: any, res: any) => {
    const { imageUrl } = req.body;
    if (!imageUrl) throw new Error("Image URL required");
    
    // Fetch image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.statusText}`);
    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

    // Call Gemini
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          }
        },
        {
          text: `Analyze this image, which contains a table, stat block, or info card (common in RPG games or web novels like Royal Road). 
          Your goal is to convert the content into an **HTML Table** that visually replicates the structure and style of the image.

          Rules:
          1. **Output ONLY raw HTML.** No markdown code blocks, no conversational text.
          2. **Structure:** Use a single main HTML <table> to contain the entire card.
          3. **Styling (Royal Road Blue Theme):**
             - **Main Table:** <table style="width: 100%; border-collapse: collapse; border: 2px solid #2a5d84; background-color: #052c46; color: #ffffff; font-family: sans-serif; font-size: 14px;">
             - **Section Headers (e.g., Title, "Required...", "Attributes"):** Use <th style="background-color: #004d99; color: white; padding: 10px; border: 1px solid #2a5d84; text-align: center; font-weight: bold;">
             - **Content/Body Cells:** Use <td style="padding: 10px; border: 1px solid #2a5d84; vertical-align: top; text-align: center;"> (Use text-align: left for long descriptions).
             - **Text Color:** Ensure all text is white (#ffffff).
          4. **Layout Fidelity:**
             - **Title:** The top row should be the Title (e.g., "Class: Voidcaller"), spanning all columns (colspan).
             - **Description:** The description text should be in its own row, spanning all columns.
             - **Key-Values (e.g., Required Archetype):** These often appear as stacked sections. Create a row for the label (Header style) and a row for the value (Body style).
             - **Data Tables (e.g., Attributes):** If there is a nested table (like STR/DEX/etc), you can nest it or just create rows within the main table to represent it.
          5. **Merged Cells:** Use 'colspan' liberally to make headers span the full width of the card.
          6. **No White Backgrounds:** The entire card must be blue.`
        }
      ]
    });

    let text = response.text;
    if (!text) throw new Error("No text returned from Gemini");
    let cleanText = text.replace(/^```html\n/, '').replace(/^```\n/, '').replace(/\n```$/, '').trim();
    
    res.json({ success: true, html: cleanText });
}));

app.post('/api/batch/retry', (req, res) => {
    queue.retryFailed();
    res.json({ success: true });
});

app.post('/api/batch/clear', (req, res) => {
    queue.clearQueue();
    res.json({ success: true });
});

app.get('/api/batch/download', asyncHandler(async (req: any, res: any) => {
    const format = req.query.format as string || 'talevox';
    const buffer = await queue.createBatchZip(format);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename=ronin_batch_${format}.zip`);
    res.send(buffer);
}));

// Error Handler
app.use((err: any, req: any, res: any, next: any) => {
    console.error(err);
    res.status(500).json({ error: err.message });
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, "0.0.0.0", () => {
    console.log(`RoninClip Backend running on port ${PORT}`);
});
}

startServer();