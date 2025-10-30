// Use legacy build for better server-side compatibility  
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';
import path from 'path';

// Configure PDF.js for server-side usage (Next.js API routes)
// Provide worker path for Node.js environment
if (typeof window === 'undefined') {
  try {
    // Try to resolve the worker file path
    const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
  } catch (e) {
    // Fallback: use a path relative to node_modules
    pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
  }
}

export async function pdfPageToImage(pdfBuffer: Buffer, pageNumber: number = 0): Promise<Buffer> {
  // Convert Buffer to Uint8Array as required by pdfjs-dist
  const uint8Array = new Uint8Array(pdfBuffer);
  // Disable worker and auto-fetch for server-side usage
  // Using disableStream prevents worker initialization issues
  const loadingTask = pdfjsLib.getDocument({ 
    data: uint8Array,
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber + 1); // pdf.js uses 1-based indexing

  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = require('canvas').createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');

  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  // Convert canvas to image buffer
  const imageBuffer = canvas.toBuffer('image/png');
  
  // Use sharp to optimize the image
  const optimizedBuffer = await sharp(imageBuffer)
    .png({ quality: 90 })
    .toBuffer();

  return optimizedBuffer;
}

