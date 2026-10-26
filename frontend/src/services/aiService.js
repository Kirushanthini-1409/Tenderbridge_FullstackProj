import { request } from './api.js';

export const aiService = {
  extractTender: (text, tenderId) =>
    request('/api/v1/tenders/extract', {
      method: 'POST',
      body: { text, tenderId },
    }),
  extractTenderFile: async (file, tenderId) => {
    if (!file || file.type !== 'application/pdf' || file.size > 8 * 1024 * 1024) {
      throw new Error('Choose a PDF file no larger than 8 MB.');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return request('/api/v1/tenders/extract', {
      method: 'POST',
      body: { fileName: file.name, fileBase64: btoa(binary), tenderId },
    });
  },
};
