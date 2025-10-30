import * as pdfjsLib from 'pdfjs-dist';
import sharp from 'sharp';

// Set up PDF.js worker
if (typeof window === 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export async function pdfPageToImage(pdfBuffer: Buffer, pageNumber: number = 0): Promise<Buffer> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
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

