import * as pdfjsLib from 'pdfjs-dist';
import sharp from 'sharp';

// Configure PDF.js for server-side usage (Next.js API routes)
// Disable worker - PDF.js will run in main thread for server-side
// Setting workerSrc to empty string prevents worker initialization
if (typeof window === 'undefined') {
  // @ts-ignore - workerSrc can be empty string to disable workers
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
}

export async function pdfPageToImage(pdfBuffer: Buffer, pageNumber: number = 0): Promise<Buffer> {
  // Convert Buffer to Uint8Array as required by pdfjs-dist
  const uint8Array = new Uint8Array(pdfBuffer);
  // Disable worker and auto-fetch for server-side usage
  const loadingTask = pdfjsLib.getDocument({ 
    data: uint8Array,
    useWorkerFetch: false,
    disableAutoFetch: true,
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

