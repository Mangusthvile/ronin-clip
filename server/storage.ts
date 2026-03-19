
import { promises as fsp } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppSettings, ProtocolTemplate } from '../types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULT_SETTINGS: AppSettings = {
  concurrency: 2,
  rateLimitPerMinute: 30,
  outputDir: './output',
  filenamePattern: '{title}.txt',
};

const DEFAULT_TEMPLATES: ProtocolTemplate[] = [
  {
    id: 'novelbin-default',
    domain: 'novelbin.com',
    titleSelector: 'h3, .chr-title, h2',
    contentSelector: '#chr-content, #txt, .chr-c',
    removeSelectors: ['.chr-nav-top', '.chr-nav-bottom', '#div-gpt-ad', '.google-auto-placed', 'script', '.ads', '#div-gpt-ad-1', '.btn-group'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'royalroad-default',
    domain: 'royalroad.com',
    titleSelector: 'h1',
    contentSelector: '.chapter-content',
    removeSelectors: ['.author-note-portlet', '.portlet-footer', '.nav-buttons', '.margin-bottom-10', '.row', 'hr'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'patreon-default',
    domain: 'patreon.com',
    titleSelector: '[data-tag="post-title"], h1, [data-testid="post-title"]',
    contentSelector: '[data-tag="post-content"], div[class*="PostContent__Wrapper"], .cm-bmFJIJ, .cm-bgKEqA', 
    removeSelectors: [
        '[data-tag="post-meta"]',
        '[data-tag="post-actions"]',
        '[data-tag="post-tags"]',
        '[aria-label="Post actions"]',
        'nav', 'button', 'ul', 'aside', 'form',
        '[class*="PostHeader__MetaContainer"]',
        '[class*="Footer"]',
        '[data-tag="comment-row"]',
        '[id="comments"]',
        '[data-tag="comments-section"]',
        'div[class*="Comment"]',
        '[data-tag="like-button"]',
        '[data-tag="share-button"]',
        '[data-tag="related-posts"]',
        '[data-tag="recommended-posts"]',
        '[data-tag="next-post"]',
        '[class*="RelatedPosts"]',
        '[aria-hidden="true"]',
        '[class*="hidden"]',
        'hr'
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'ranobes-default',
    domain: 'ranobes.top',
    titleSelector: 'h1',
    contentSelector: '#arr',
    removeSelectors: ['.ads', 'script', 'div[id^="yandex"]', '.mistape_caption', '.navi', '.roi'],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

export function getDefaultTemplates(): ProtocolTemplate[] {
    return DEFAULT_TEMPLATES;
}

async function ensureDir(dir: string) {
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch (e) {
    // ignore if exists
  }
}

async function readJson<T>(file: string, defaultVal: T): Promise<T> {
  try {
    const data = await fsp.readFile(file, 'utf-8');
    if (!data.trim()) return defaultVal;
    return JSON.parse(data);
  } catch (e) {
    return defaultVal;
  }
}

async function writeJson(file: string, data: any) {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

export async function seedDefaults() {
  const currentTemplates = await getTemplates();
  let changed = false;
  
  for (const def of DEFAULT_TEMPLATES) {
      const idx = currentTemplates.findIndex(t => t.id === def.id);
      
      if (idx === -1) {
          currentTemplates.push(def);
          changed = true;
      } else {
          const existing = currentTemplates[idx];
          if (existing.contentSelector !== def.contentSelector || existing.titleSelector !== def.titleSelector) {
             console.log(`[Storage] Updating default protocol definition for: ${def.domain}`);
             currentTemplates[idx] = {
                 ...existing,
                 titleSelector: def.titleSelector,
                 contentSelector: def.contentSelector,
                 removeSelectors: def.removeSelectors,
                 updatedAt: Date.now()
             };
             changed = true;
          }
      }
  }
  
  if (changed) {
      await saveTemplates(currentTemplates);
      console.log('Seeded/Updated default protocols.');
      return true;
  }
  return false;
}

export async function initStorage() {
  await ensureDir(DATA_DIR);
  await seedDefaults();
}

export async function getSettings(): Promise<AppSettings> {
  const loaded = await readJson<Partial<AppSettings>>(SETTINGS_FILE, {});
  return { ...DEFAULT_SETTINGS, ...loaded };
}

export async function saveSettings(settings: AppSettings) {
  await writeJson(SETTINGS_FILE, settings);
}

export async function getTemplates(): Promise<ProtocolTemplate[]> {
  return readJson<ProtocolTemplate[]>(TEMPLATES_FILE, []);
}

export async function saveTemplates(templates: ProtocolTemplate[]) {
  await writeJson(TEMPLATES_FILE, templates);
}
