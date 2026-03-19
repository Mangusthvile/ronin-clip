
export interface ProtocolTemplate {
  id: string;
  domain: string; // Normalized hostname
  titleSelector: string;
  contentSelector: string;
  removeSelectors?: string[]; // Array of selectors to remove
  cookies?: string; // Auth cookies
  userAgent?: string; // Custom UA
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  concurrency: number;
  rateLimitPerMinute: number;
  outputDir: string;
  filenamePattern: string; // e.g. "{title}.txt"
}

export interface ExtractedChapter {
  title: string;
  content: string;
  url: string;
  hasRichContent?: boolean; // True if tables/boxes were detected
  hasImages?: boolean; // True if images were detected
}

export interface ExtractionResponse {
  success: boolean;
  data?: ExtractedChapter;
  error?: string;
  matchedProtocol?: string;
}

export interface DiagnosticResult {
  host: string;
  matchedProtocolId?: string;
  titleMatches: number;
  contentMatches: number;
  paragraphCount: number;
  titlePreview: string;
  contentPreview: string;
  error?: string;
}

export interface BatchItem {
  id: string;
  url: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  result?: ExtractedChapter;
  error?: string;
  // Manual overrides for TaleVox
  manualSeriesTitle?: string;
  manualChapterIndex?: number;
}

export interface BatchStatus {
  queue: BatchItem[];
  isProcessing: boolean;
  completedCount: number;
  failedCount: number;
  totalCount: number;
}
