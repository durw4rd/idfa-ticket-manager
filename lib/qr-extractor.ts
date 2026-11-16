import jsQR, { type QRCode } from 'jsqr';
import sharp from 'sharp';

export interface ExtractedQRCode {
  image: Buffer; // Cropped PNG of the QR code
  payload: string; // Decoded QR content, used to detect duplicate tickets
}

/**
 * Extract QR code from a base64-encoded image
 * The image should be a PNG image of a single ticket page
 */
export async function extractQRCodeFromImage(
  base64Image: string
): Promise<ExtractedQRCode | null> {
  try {
    // Convert base64 to buffer
    // Handle both "data:image/png;base64,..." and plain base64 strings
    const base64Data = base64Image.includes(',') 
      ? base64Image.split(',')[1] 
      : base64Image;
    const imageBuffer = Buffer.from(base64Data, 'base64');

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

    const qrCodeImage = await cropToCode(imageBuffer, qrCode.location, info.width, info.height);

    return { image: qrCodeImage, payload: qrCode.data };
  } catch (error) {
    console.error('Error extracting QR code:', error);
    return null;
  }
}

async function tryFindQRCodeInRegions(
  imageBuffer: Buffer,
  width: number,
  height: number
): Promise<ExtractedQRCode | null> {
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
      // Crop to the code within the region, as for a code found on the whole page: the region is a
      // quarter of the ticket, and stored as is it would show a small code among the ticket's text
      const image = await cropToCode(croppedBuffer, qrCode.location, info.width, info.height);
      return { image, payload: qrCode.data };
    }
  }

  return null;
}


// White space kept around the code, in source pixels, so scanners find its edges
const QR_PADDING = 50;

/** The code's square (from jsQR's corners) plus padding, clamped to the image, as a 500×500 PNG */
async function cropToCode(
  imageBuffer: Buffer,
  location: QRCode['location'],
  imageWidth: number,
  imageHeight: number
): Promise<Buffer> {
  // All four corners, so a slightly rotated code isn't clipped (sharp needs whole pixels)
  const corners = [location.topLeftCorner, location.topRightCorner, location.bottomLeftCorner, location.bottomRightCorner];
  const left = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x)) - QR_PADDING));
  const top = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y)) - QR_PADDING));
  const right = Math.min(imageWidth, Math.ceil(Math.max(...corners.map((c) => c.x)) + QR_PADDING));
  const bottom = Math.min(imageHeight, Math.ceil(Math.max(...corners.map((c) => c.y)) + QR_PADDING));

  return sharp(imageBuffer)
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize(500, 500, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
}
