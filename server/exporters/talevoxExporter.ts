import { ExtractedChapter } from '../../types.ts';
import { cleanText, parseChapterMetadata, formatChapterContent, buildFilename } from '../../src/lib/talevox.ts';

// Re-export for backend consumption
export { cleanText, parseChapterMetadata, formatChapterContent, buildFilename };

export function generateManifest(seriesTitle: string, seriesSlug: string, items: Array<{index: number, title: string, filename: string, url: string}>) {
    return JSON.stringify({
        seriesTitle: seriesTitle, 
        seriesSlug: seriesSlug,
        createdAt: new Date().toISOString(),
        exporter: "RoninClip v2.0",
        chapters: items.map(item => ({
            chapterIndex: item.index,
            title: item.title,
            filename: item.filename,
            sourceUrl: item.url
        }))
    }, null, 2);
}