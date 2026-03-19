
/**
 * Normalizes text according to TaleVox requirements:
 * - CRLF -> LF
 * - NBSP -> Space
 * - Remove Zero-width chars
 * - Trim lines
 * - Max 2 consecutive newlines
 */
export function cleanText(text: string): string {
    if (!text) return '';
    
    return text
        // Normalize newlines
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Replace non-breaking spaces
        .replace(/\u00A0/g, ' ')
        // Remove zero-width characters (ZWSP, BOM, etc)
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        // Trim each line
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        // Ensure no more than 2 consecutive newlines (paragraph breaks)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export interface ChapterMetaDebug {
    original: string;
    normalized: string;
    strategy: 'chapter_match' | 'simple_start_match' | 'fallback_short' | 'none';
    regexUsed?: string;
    match?: {
        full: string;
        numberGroup: string;
        index: number;
    };
    prefix?: string;
    suffix?: string;
    cleanSuffix?: string;
    finalIndex: number | null;
    finalTitle: string;
}

/**
 * Parses chapter metadata with full debug trace.
 * Useful for diagnosing why a title isn't parsing correctly.
 */
export function debugChapterMetadata(rawTitle: string): ChapterMetaDebug {
    const debug: ChapterMetaDebug = {
        original: rawTitle,
        normalized: rawTitle.replace(/[\u2010-\u2015\u2212]/g, '-').trim(),
        strategy: 'none',
        finalIndex: null,
        finalTitle: ''
    };

    const text = debug.normalized;

    // Strategy 1: "Chapter X" pattern
    // Improved Regex:
    // (?:chapter|ch\.?|episode|ep\.?) -> Matches "Chapter", "Ch.", "Episode"
    // \s* -> Optional space
    // (\d+(?:[\.\-]\d+)?) -> Captures number (1, 1.5, 1-5). 
    const markerRegex = /(?:chapter|ch\.?|episode|ep\.?)\s*(\d+(?:[\.\-]\d+)?)/i;
    const match = text.match(markerRegex);

    if (match && match.index !== undefined) {
        debug.strategy = 'chapter_match';
        debug.regexUsed = markerRegex.toString();
        debug.match = {
            full: match[0],
            numberGroup: match[1],
            index: match.index
        };

        const parsedIdx = parseFloat(match[1].replace('-', '.'));
        if (!isNaN(parsedIdx)) {
            debug.finalIndex = parsedIdx;

            const startIdx = match.index;
            const endIdx = startIdx + match[0].length;

            debug.prefix = text.substring(0, startIdx).trim();
            debug.suffix = text.substring(endIdx).trim();

            // Suffix Cleaning Logic
            // Removes leading separators like ":", "-", ".", "|", ","
            const cleanSuffix = debug.suffix.replace(/^[\s:\-\.\|,]+/, '').trim();
            debug.cleanSuffix = cleanSuffix;

            if (cleanSuffix) {
                debug.finalTitle = cleanSuffix;
            } else if (debug.prefix) {
                // If suffix is empty, try prefix (e.g. "My Story - Chapter 1")
                debug.finalTitle = debug.prefix.replace(/[\s:\-\.\|,]+$/, '').trim();
            }
        }
    } 
    // Strategy 2: "995 - Title" or "995: Title" (Start of string)
    else {
        const simpleRegex = /^(\d+(?:[\.]\d+)?)\s*[\-–—:\.]\s*(.+)$/;
        const simpleMatch = text.match(simpleRegex);
        
        if (simpleMatch) {
            debug.strategy = 'simple_start_match';
            debug.regexUsed = simpleRegex.toString();
            debug.match = {
                full: simpleMatch[0],
                numberGroup: simpleMatch[1],
                index: 0
            };

            const parsedIdx = parseFloat(simpleMatch[1]);
            if (!isNaN(parsedIdx)) {
                debug.finalIndex = parsedIdx;
                debug.finalTitle = simpleMatch[2].trim();
            }
        }
    }

    // Final Sanity Cleanup
    if (debug.finalTitle && /^\d+$/.test(debug.finalTitle) && parseFloat(debug.finalTitle) === debug.finalIndex) {
        debug.finalTitle = ''; // Title is just the number repeated
    }

    // "Read Chapter X" cleanup
    debug.finalTitle = debug.finalTitle.replace(/^read\s+/i, '');

    // Fallback: If no index found, but text is short, assume it's a special title (Prologue)
    if (debug.finalIndex === null && text.length < 100 && text.length > 0) {
        debug.strategy = 'fallback_short';
        debug.finalTitle = text;
    }

    return debug;
}

/**
 * Standard parse function that calls debug but only returns the result.
 */
export function parseChapterMetadata(rawTitle: string): { index: number | null, title: string } {
    const result = debugChapterMetadata(rawTitle);
    return { index: result.finalIndex, title: result.finalTitle };
}

/**
 * Formats the file content.
 */
export function formatChapterContent(index: number | null, title: string, content: string): string {
    const body = cleanText(content);
    let header = '';

    if (index !== null) {
        header = `Chapter ${index}`;
        if (title) {
            header += `: ${title}`;
        }
    } else {
        header = title || 'Chapter';
    }
    
    return `${header}\n\n${body}`;
}

export function buildFilename(seriesSlug: string, index: number, title: string): string {
    const paddedIndex = index.toString().padStart(4, '0');
    
    let safeTitle = (title || 'chapter').toLowerCase().trim();
    safeTitle = safeTitle.replace(/\s+/g, '_');
    safeTitle = safeTitle.replace(/[^a-z0-9_\-]/g, '');
    safeTitle = safeTitle.substring(0, 60);
    safeTitle = safeTitle.replace(/[_\-]+$/, '');
    
    if (!safeTitle) safeTitle = 'chapter';
    
    return `${seriesSlug}__${paddedIndex}__${safeTitle}.txt`;
}
