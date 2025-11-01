const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

async function optimizeBackgrounds() {
  const publicDir = path.join(process.cwd(), 'public');
  const files = await fs.readdir(publicDir);
  const backgroundFiles = files.filter(f => f.startsWith('bcg-') && f.endsWith('.png'));

  console.log(`Found ${backgroundFiles.length} background images to optimize...\n`);

  for (const file of backgroundFiles) {
    const inputPath = path.join(publicDir, file);
    const tempPath = path.join(publicDir, file.replace('.png', '.tmp'));
    const webpPath = path.join(publicDir, file.replace('.png', '.webp'));

    try {
      const metadata = await sharp(inputPath).metadata();
      console.log(`Processing ${file} (${metadata.width}x${metadata.height})...`);

      // Determine optimal dimensions - since these are backgrounds used with cover/contain,
      // we can reduce to max 1200px (sufficient for most displays)
      const maxDimension = 1200;
      const shouldResize = metadata.width > maxDimension || metadata.height > maxDimension;
      
      let sharpInstance = sharp(inputPath);
      if (shouldResize) {
        sharpInstance = sharpInstance.resize(maxDimension, maxDimension, {
          withoutEnlargement: true,
          fit: 'inside',
        });
      }

      // Optimize PNG with aggressive compression
      await sharpInstance
        .png({
          quality: 75, // Reduced from 80
          compressionLevel: 9,
          adaptiveFiltering: true,
          palette: true, // Use palette if possible for smaller files
        })
        .toFile(tempPath);

      // Also create WebP version for modern browsers (much smaller file size)
      if (shouldResize) {
        sharpInstance = sharp(inputPath).resize(maxDimension, maxDimension, {
          withoutEnlargement: true,
          fit: 'inside',
        });
      } else {
        sharpInstance = sharp(inputPath);
      }

      await sharpInstance
        .webp({
          quality: 75,
          effort: 6, // Higher effort = better compression (slower but worth it)
        })
        .toFile(webpPath);

      // Get file sizes
      const inputStats = await fs.stat(inputPath);
      const outputStats = await fs.stat(tempPath);
      const webpStats = await fs.stat(webpPath);
      
      const pngReduction = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1);
      const webpReduction = ((1 - webpStats.size / inputStats.size) * 100).toFixed(1);

      // Replace original PNG with optimized version
      await fs.rename(tempPath, inputPath);

      console.log(`✓ ${file}:`);
      console.log(`  PNG: ${(inputStats.size / 1024).toFixed(0)}KB → ${(outputStats.size / 1024).toFixed(0)}KB (${pngReduction}% reduction)`);
      console.log(`  WebP: ${(webpStats.size / 1024).toFixed(0)}KB (${webpReduction}% reduction)`);
      console.log('');
    } catch (error) {
      console.error(`✗ Failed to optimize ${file}:`, error);
      // Clean up temp files if they exist
      try {
        await fs.unlink(tempPath);
      } catch {}
      try {
        await fs.unlink(webpPath);
      } catch {}
    }
  }

  console.log('✓ Optimization complete!');
  console.log('\nNote: WebP versions have been created for modern browsers.');
  console.log('Update the code to use WebP with PNG fallback for best performance.');
}

optimizeBackgrounds().catch(console.error);

