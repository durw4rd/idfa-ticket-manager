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

    try {
      // Resize to max 1920px width (good for web backgrounds)
      // Compress with quality 80% for good balance between size and quality
      await sharp(inputPath)
        .resize(1920, null, {
          withoutEnlargement: true,
          fit: 'inside',
        })
        .png({
          quality: 80,
          compressionLevel: 9,
          adaptiveFiltering: true,
        })
        .toFile(tempPath);

      // Get file sizes
      const inputStats = await fs.stat(inputPath);
      const outputStats = await fs.stat(tempPath);
      const reduction = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1);

      // Replace original with optimized
      await fs.rename(tempPath, inputPath);

      console.log(`✓ ${file}: ${(inputStats.size / 1024 / 1024).toFixed(2)}MB → ${(outputStats.size / 1024 / 1024).toFixed(2)}MB (${reduction}% reduction)`);
    } catch (error) {
      console.error(`✗ Failed to optimize ${file}:`, error);
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {}
    }
  }

  console.log('\n✓ Optimization complete!');
}

optimizeBackgrounds().catch(console.error);

