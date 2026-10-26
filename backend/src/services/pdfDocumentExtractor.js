import { execFile } from 'node:child_process';
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { extractPdfText } from './pdfTextExtractor.js';

const execFileAsync = promisify(execFile);
const MAX_OCR_PAGES = 25;
const MIN_TEXT_LAYER_CHARS = 80;
const OCR_TOTAL_TIMEOUT_MS = 90_000;

async function findExecutable(configuredPath, executableName) {
  const candidates = [];
  if (configuredPath) candidates.push(resolve(configuredPath));
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
    : [''];
  for (const directory of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    for (const extension of extensions) candidates.push(join(directory, `${executableName}${extension}`));
  }
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* Continue checking the configured PATH. */ }
  }
  return null;
}

function normalizeText(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Reads a PDF text layer first and uses local Poppler + Tesseract only when that
 * layer is absent or very sparse. Tender files never leave the local machine.
 */
export async function extractPdfDocument(pdfBytes) {
  const textLayer = normalizeText(extractPdfText(pdfBytes));
  if (textLayer.length >= MIN_TEXT_LAYER_CHARS) {
    return { text: textLayer, method: 'TEXT_LAYER', ocrStatus: 'NOT_NEEDED', pagesProcessed: 0, message: null };
  }

  const renderer = await findExecutable(process.env.PDFTOPPM_PATH, 'pdftoppm');
  if (!renderer) {
    return {
      text: textLayer, method: textLayer ? 'TEXT_LAYER' : 'NONE', ocrStatus: 'RENDERER_NOT_CONFIGURED',
      pagesProcessed: 0, message: 'Local PDF page rendering is unavailable. Install Poppler and set PDFTOPPM_PATH or add it to PATH to enable OCR.',
    };
  }
  const ocrEngine = await findExecutable(process.env.TESSERACT_PATH, 'tesseract');
  if (!ocrEngine) {
    return {
      text: textLayer, method: textLayer ? 'TEXT_LAYER' : 'NONE', ocrStatus: 'ENGINE_NOT_CONFIGURED',
      pagesProcessed: 0, message: 'Local OCR is unavailable. Install Tesseract with English language data and set TESSERACT_PATH or add it to PATH.',
    };
  }

  let temporaryDirectory;
  try {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tenderbridge-ocr-'));
    const inputPath = join(temporaryDirectory, 'source.pdf');
    const prefixPath = join(temporaryDirectory, 'page');
    await writeFile(inputPath, pdfBytes, { mode: 0o600 });
    await execFileAsync(renderer, ['-f', '1', '-l', String(MAX_OCR_PAGES), '-r', '180', '-png', inputPath, prefixPath], {
      timeout: 45_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024,
    });
    const pageFiles = (await readdir(temporaryDirectory))
      .filter(name => name.startsWith('page-') && extname(name).toLowerCase() === '.png')
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const pages = [];
    const startedAt = Date.now();
    let processedPageCount = 0;
    for (const [index, name] of pageFiles.entries()) {
      const remaining = OCR_TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
      if (remaining <= 0) break;
      const imagePath = join(temporaryDirectory, name);
      let stdout;
      try {
        ({ stdout } = await execFileAsync(ocrEngine, [imagePath, 'stdout', '-l', process.env.TESSERACT_LANG || 'eng', '--psm', '3'], {
          timeout: Math.min(15_000, remaining), windowsHide: true, maxBuffer: 512 * 1024,
        }));
        processedPageCount += 1;
      } catch (error) {
        if (pages.length) break;
        throw error;
      }
      const pageText = normalizeText(stdout);
      if (pageText) pages.push(`[PAGE ${index + 1}]\n${pageText}`);
    }
    const text = normalizeText(pages.join('\n\n'));
    if (text) {
      const pageLimitReached = pageFiles.length >= MAX_OCR_PAGES;
      const timedOut = processedPageCount < pageFiles.length;
      return {
        text, method: 'OCR', ocrStatus: timedOut ? 'PARTIAL' : 'SUCCEEDED', pagesProcessed: processedPageCount,
        message: timedOut ? 'OCR reached its time limit; review the recognized pages and enter any missing requirements manually.'
          : pageLimitReached ? `OCR processed the first ${MAX_OCR_PAGES} pages; review the remaining pages manually.` : null,
      };
    }
    return {
      text: textLayer, method: textLayer ? 'TEXT_LAYER' : 'NONE', ocrStatus: 'NO_TEXT_RECOGNIZED',
      pagesProcessed: pageFiles.length, message: 'OCR ran locally but could not recognize readable text. Enter confirmed requirements manually.',
    };
  } catch {
    return {
      text: textLayer, method: textLayer ? 'TEXT_LAYER' : 'NONE', ocrStatus: 'FAILED',
      pagesProcessed: 0, message: 'Local OCR could not process this PDF. Enter confirmed requirements manually.',
    };
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  }
}
