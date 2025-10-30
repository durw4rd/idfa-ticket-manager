import { pdfPageToImage } from './pdf-utils';
import jsQR from 'jsqr';
import sharp from 'sharp';

export async function extractQRCodeFromPDFPage(
  pdfBuffer: Buffer,
  pageNumber: number = 0
): Promise<Buffer | null> {
  try {
    // Convert PDF page to high-resolution image
    const imageBuffer = await pdfPageToImage(pdfBuffer, pageNumber);

    // Use sharp to get image data for jsQR
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // jsQR expects Uint8ClampedArray
    const imageData = new Uint8ClampedArray(data.buffer);

    // Try to find QR code
    const qrCode = jsQR(imageData, info.width, info.height);

    if (!qrCode) {
      // If jsQR doesn't find it, try cropping common QR code locations
      // and search there (top-left, top-right, center)
      return await tryFindQRCodeInRegions(imageBuffer, info.width, info.height);
    }

    // Extract QR code region (with some padding)
    const padding = 50;
    const x = Math.max(0, qrCode.location.topLeftCorner.x - padding);
    const y = Math.max(0, qrCode.location.topLeftCorner.y - padding);
    const width = qrCode.location.bottomRightCorner.x - qrCode.location.topLeftCorner.x + (padding * 2);
    const height = qrCode.location.bottomRightCorner.y - qrCode.location.topLeftCorner.y + (padding * 2);

    const qrCodeImage = await sharp(imageBuffer)
      .extract({
        left: x,
        top: y,
        width: Math.min(width, info.width - x),
        height: Math.min(height, info.height - y),
      })
      .resize(500, 500, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();

    return qrCodeImage;
  } catch (error) {
    console.error('Error extracting QR code:', error);
    return null;
  }
}

async function tryFindQRCodeInRegions(
  imageBuffer: Buffer,
  width: number,
  height: number
): Promise<Buffer | null> {
  const regions = [
    // Top-left region
    { left: 0, top: 0, regionWidth: width / 2, regionHeight: height / 2 },
    // Top-right region
    { left: width / 2, top: 0, regionWidth: width / 2, regionHeight: height / 2 },
    // Center region
    { left: width / 4, top: height / 4, regionWidth: width / 2, regionHeight: height / 2 },
  ];

  for (const region of regions) {
    const croppedBuffer = await sharp(imageBuffer)
      .extract({
        left: Math.floor(region.left),
        top: Math.floor(region.top),
        width: Math.floor(region.regionWidth),
        height: Math.floor(region.regionHeight),
      })
      .toBuffer();

    const { data, info } = await sharp(croppedBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imageData = new Uint8ClampedArray(data.buffer);
    const qrCode = jsQR(imageData, info.width, info.height);

    if (qrCode) {
      // Found QR code in this region, return the cropped region with padding
      return await sharp(croppedBuffer)
        .resize(500, 500, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
    }
  }

  return null;
}

