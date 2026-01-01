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

export async function initStorage() {
  await ensureDir(DATA_DIR);
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