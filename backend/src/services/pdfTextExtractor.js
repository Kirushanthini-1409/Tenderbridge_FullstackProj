import { inflateSync } from 'node:zlib';

function decodePdfString(value) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' })[char])
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function textOperators(source) {
  const output = [];
  const textBlocks = source.matchAll(/BT([\s\S]*?)ET/g);
  for (const [, block] of textBlocks) {
    for (const match of block.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:.|\n)*?)\]\s*TJ|<([0-9a-f\s]+)>\s*Tj/gi)) {
      if (match[1] !== undefined) output.push(decodePdfString(match[1]));
      else if (match[2] !== undefined) {
        for (const [, part] of match[2].matchAll(/\(((?:\\.|[^\\)])*)\)/g)) output.push(decodePdfString(part));
      } else if (match[3]) {
        const hex = match[3].replace(/\s/g, '');
        const bytes = Buffer.from(hex.slice(0, hex.length - (hex.length % 2)), 'hex');
        if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
          output.push(Buffer.from(bytes.subarray(2).map((value, index, array) => index % 2 === 0 ? array[index + 1] : array[index - 1])).toString('utf16le'));
        } else output.push(bytes.toString('latin1'));
      }
    }
  }
  return output.join(' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extracts text from common unencrypted PDFs with literal text drawing operators.
 * Scanned/image-only PDFs and unusual font encodings return an empty string; callers
 * must report that extraction is unavailable rather than infer requirements.
 */
export function extractPdfText(pdfBytes) {
  const source = Buffer.isBuffer(pdfBytes) ? pdfBytes.toString('latin1') : Buffer.from(pdfBytes).toString('latin1');
  if (!source.startsWith('%PDF-')) throw new TypeError('The uploaded file is not a valid PDF.');
  const fragments = [];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of source.matchAll(streamPattern)) {
    const dictionary = match[1];
    const streamBytes = Buffer.from(match[2], 'latin1');
    let content = streamBytes.toString('latin1');
    if (/\/FlateDecode\b/.test(dictionary)) {
      try { content = inflateSync(streamBytes).toString('latin1'); } catch { continue; }
    } else if (/\/Filter\b/.test(dictionary)) {
      continue;
    }
    const extracted = textOperators(content);
    if (extracted) fragments.push(extracted);
  }
  if (!fragments.length) {
    const fallback = textOperators(source);
    if (fallback) fragments.push(fallback);
  }
  return fragments.join(' ').replace(/\s+/g, ' ').trim();
}
