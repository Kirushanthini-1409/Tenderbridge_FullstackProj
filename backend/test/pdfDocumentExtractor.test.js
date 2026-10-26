import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfDocument } from '../src/services/pdfDocumentExtractor.js';

const originalPath = process.env.PATH;
const originalRenderer = process.env.PDFTOPPM_PATH;
const originalOcr = process.env.TESSERACT_PATH;
const validSparsePdf = Buffer.from('%PDF-1.4\n%%EOF', 'ascii');

test('uses a readable PDF text layer without invoking OCR tools', async () => {
  process.env.PDFTOPPM_PATH = 'missing-renderer';
  process.env.TESSERACT_PATH = 'missing-tesseract';
  process.env.PATH = '';
  try {
    const content = `BT (${('Tender notice requirement '.repeat(6)).trim()}) Tj ET`;
    const result = await extractPdfDocument(Buffer.from(`%PDF-1.4\n${content}\n%%EOF`, 'ascii'));
    assert.equal(result.method, 'TEXT_LAYER');
    assert.equal(result.ocrStatus, 'NOT_NEEDED');
    assert.match(result.text, /Tender notice requirement/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    if (originalRenderer === undefined) delete process.env.PDFTOPPM_PATH; else process.env.PDFTOPPM_PATH = originalRenderer;
    if (originalOcr === undefined) delete process.env.TESSERACT_PATH; else process.env.TESSERACT_PATH = originalOcr;
  }
});

test('reports a missing local renderer without failing PDF upload processing', async () => {
  process.env.PDFTOPPM_PATH = 'missing-renderer';
  process.env.PATH = '';
  try {
    const result = await extractPdfDocument(validSparsePdf);
    assert.equal(result.method, 'NONE');
    assert.equal(result.ocrStatus, 'RENDERER_NOT_CONFIGURED');
    assert.match(result.message, /Install Poppler/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    if (originalRenderer === undefined) delete process.env.PDFTOPPM_PATH; else process.env.PDFTOPPM_PATH = originalRenderer;
    if (originalOcr === undefined) delete process.env.TESSERACT_PATH; else process.env.TESSERACT_PATH = originalOcr;
  }
});

test('reports a missing Tesseract engine before rendering a scanned PDF', async () => {
  process.env.PDFTOPPM_PATH = process.execPath;
  process.env.TESSERACT_PATH = 'missing-tesseract';
  try {
    const result = await extractPdfDocument(validSparsePdf);
    assert.equal(result.method, 'NONE');
    assert.equal(result.ocrStatus, 'ENGINE_NOT_CONFIGURED');
    assert.match(result.message, /Install Tesseract/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    if (originalRenderer === undefined) delete process.env.PDFTOPPM_PATH; else process.env.PDFTOPPM_PATH = originalRenderer;
    if (originalOcr === undefined) delete process.env.TESSERACT_PATH; else process.env.TESSERACT_PATH = originalOcr;
  }
});
