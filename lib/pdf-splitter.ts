import { PDFDocument } from 'pdf-lib';

export async function splitPDFIntoPages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const pageCount = sourcePdf.getPageCount();
  const pageBuffers: Buffer[] = [];

  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(sourcePdf, [i]);
    newPdf.addPage(copiedPage);
    const pdfBytes = await newPdf.save();
    pageBuffers.push(Buffer.from(pdfBytes));
  }

  return pageBuffers;
}

export async function getPDFPageCount(pdfBuffer: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(pdfBuffer);
  return pdf.getPageCount();
}

