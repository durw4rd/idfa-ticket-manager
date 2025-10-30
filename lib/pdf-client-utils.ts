/**
 * Client-side PDF utilities using pdfjs-dist
 * These functions run in the browser where pdfjs-dist works perfectly
 */

export interface PDFPageImage {
  pageNumber: number;
  imageData: string; // Base64 encoded image
  width: number;
  height: number;
}

// Initialize pdfjs-dist worker source when module loads
// This ensures it's set before any PDF operations
let workerSrcInitialized = false;

function initializeWorkerSrc() {
  if (typeof window !== 'undefined' && !workerSrcInitialized) {
    // Set worker source for browser - use local file from public directory
    // Next.js serves files from /public at the root URL
    import('pdfjs-dist').then((pdfjsLib) => {
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        workerSrcInitialized = true;
      }
    });
  }
}

// Initialize on module load if in browser
if (typeof window !== 'undefined') {
  initializeWorkerSrc();
}

/**
 * Convert a PDF file to images on the client side
 * Returns an array of base64-encoded images, one per page
 */
export async function pdfFileToImages(file: File): Promise<PDFPageImage[]> {
  // Dynamically import pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist');
  
  // Ensure worker source is set
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const images: PDFPageImage[] = [];
  const scale = 2.0; // Higher scale for better quality

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Failed to get canvas context');
    }

    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    // Convert canvas to base64 image
    const imageData = canvas.toDataURL('image/png');

    images.push({
      pageNumber: pageNum,
      imageData,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return images;
}

/**
 * Split a multi-page PDF into individual page images
 */
export async function splitPDFIntoPageImages(file: File): Promise<PDFPageImage[]> {
  return pdfFileToImages(file);
}

