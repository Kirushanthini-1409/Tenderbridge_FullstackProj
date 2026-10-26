import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { extractPdfText } from '../src/services/pdfTextExtractor.js';

test('extracts text operators from a basic PDF content stream', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Length 50 >> stream\nBT (Minimum turnover 40 lakhs) Tj ET\nendstream\nendobj', 'latin1');
  assert.match(extractPdfText(pdf), /Minimum turnover 40 lakhs/);
});

test('extracts text from a Flate-compressed PDF content stream', () => {
  const content = deflateSync(Buffer.from('BT (Experience 3 years) Tj ET', 'latin1'));
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n<< /Filter /FlateDecode >>\nstream\n', 'latin1'), content, Buffer.from('\nendstream', 'latin1')]);
  assert.match(extractPdfText(pdf), /Experience 3 years/);
});

test('returns no requirements for image-only PDFs and rejects non-PDF input', () => {
  assert.equal(extractPdfText(Buffer.from('%PDF-1.4\n(no text operators)')), '');
  assert.throws(() => extractPdfText(Buffer.from('not a PDF')), /not a valid PDF/);
});
