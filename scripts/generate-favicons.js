const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

// SVG for the favicon - logo on black background
// Logo scaled and centered - using single SVG with transform to scale the logo path
// Logo is 160x75, scaled 2x = 320x150, centered on 512x512: x=(512-320)/2=96, y=(512-150)/2=181
const logoSVG = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#000000"/>
  <g transform="translate(96, 181) scale(2.0)">
    <rect width="158.558" height="75" transform="translate(0.684326)" fill="#000000"/>
    <path
      fill-rule="evenodd"
      d="M143.243 63.6187H133.305V59.8364C133.327 59.7413 133.248 59.7933 133.248 59.8364C131.868 61.109 130.4 62.27 128.481 63.0026C126.681 63.6884 124.226 63.9875 121.665 63.8519C120.083 63.7695 118.762 63.4691 117.448 63.0026C114.977 62.1281 112.816 60.6286 111.063 58.811C109.277 56.9591 107.92 54.7803 107.018 52.2731C106.102 49.7191 105.653 46.2918 106.153 42.8936C106.593 39.8921 107.736 37.3153 109.157 35.3024C109.858 34.3087 110.693 33.3137 111.612 32.4594C112.522 31.6114 113.465 30.7799 114.53 30.1145C116.682 28.7672 119.354 27.7709 122.386 27.6809C124.826 27.6099 126.888 27.8964 128.741 28.7367C130.044 29.3274 131.129 30.1336 132.092 31.1095C132.248 31.2681 132.393 31.4362 132.539 31.6059C132.683 31.774 132.829 31.9437 132.989 32.107V28.2082H143.243L143.243 63.6187ZM104.881 23.0507C103.189 23.0722 101.405 23.0963 99.7113 23.1381C99.6454 23.1399 99.5802 23.1415 99.5158 23.1431C99.0341 23.1548 98.5938 23.1654 98.1801 23.256C97.1572 23.4804 96.5362 23.9975 96.2446 24.8975C95.9645 25.7556 95.948 26.8748 95.9556 28.1803C97.5359 28.2216 99.164 28.2155 100.792 28.2093C101.812 28.2055 102.832 28.2016 103.841 28.2095V36.1238H95.9556V63.6478H85.8739V36.1238H72.6144V63.677H62.6493V59.8377C62.7063 59.7692 62.6366 59.7692 62.5909 59.8085C60.6009 61.9062 57.7719 63.4539 54.3584 63.7936C50.3506 64.1954 46.8573 63.3689 44.2196 61.8023C41.6478 60.275 39.5564 58.2153 37.9505 55.5877C36.3332 52.9399 35.2938 49.728 35.2938 45.7087C35.2938 41.6907 36.4675 38.5485 38.095 35.9767C39.7301 33.3898 41.8557 31.311 44.4212 29.8217C47.1438 28.2399 50.2593 27.3969 54.3876 27.7696C57.3802 28.0383 59.9216 29.4009 61.6086 31.2869C61.8431 31.5455 62.0789 31.8054 62.3311 32.0488V16.7778H72.6144V28.1499C75.3047 28.193 78.0424 28.1867 80.7803 28.1804C82.4721 28.1765 84.1639 28.1726 85.8447 28.1803C85.3656 20.7869 88.5838 17.0933 94.6552 16.1618C97.2072 15.7711 100.215 15.8918 103.076 16.0066C103.686 16.0311 104.29 16.0554 104.881 16.0743C104.936 18.3381 104.919 20.7844 104.881 23.0507ZM28.9093 63.6478H18.6843V28.2957L18.7122 28.2082H28.9093V63.6478ZM28.9093 25.0141H18.6843V16.8652L18.7122 16.7778H28.9093V25.0141ZM54.2137 54.6416C58.892 54.6416 62.6848 50.6798 62.6848 45.7933C62.6848 40.9055 58.8919 36.9436 54.2137 36.9436C49.5354 36.9436 45.7425 40.9055 45.7425 45.7933C45.7425 50.6798 49.5354 54.6416 54.2137 54.6416ZM133.473 45.7933C133.473 50.6798 129.68 54.6416 125.002 54.6416C120.324 54.6416 116.531 50.6798 116.531 45.7933C116.531 40.9055 120.324 36.9436 125.002 36.9436C129.68 36.9436 133.473 40.9055 133.473 45.7933Z"
      fill="#FFD600"
    />
  </g>
</svg>
`;

async function generateFavicons() {
  const publicDir = path.join(process.cwd(), 'public');
  const svgBuffer = Buffer.from(logoSVG);

  const sizes = [
    { size: 16, name: 'favicon-16x16.png' },
    { size: 32, name: 'favicon-32x32.png' },
    { size: 180, name: 'apple-touch-icon.png' },
    { size: 192, name: 'android-chrome-192x192.png' },
    { size: 512, name: 'android-chrome-512x512.png' },
  ];

  console.log('Generating favicon files...\n');

  for (const { size, name } of sizes) {
    try {
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0 }, // Black background
        })
        .png({
          quality: 100,
          compressionLevel: 9,
        })
        .toFile(path.join(publicDir, name));

      console.log(`✓ Generated ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`✗ Failed to generate ${name}:`, error);
    }
  }

  // Generate favicon.ico (multi-resolution ICO file)
  try {
    const favicon16 = await sharp(svgBuffer)
      .resize(16, 16, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0 },
      })
      .png()
      .toBuffer();

    const favicon32 = await sharp(svgBuffer)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0 },
      })
      .png()
      .toBuffer();

    // For simplicity, we'll use the 32x32 PNG as favicon.ico
    // (Most modern browsers support PNG in .ico files)
    await sharp(favicon32)
      .png()
      .toFile(path.join(publicDir, 'favicon.ico'));

    console.log('✓ Generated favicon.ico');
  } catch (error) {
    console.error('✗ Failed to generate favicon.ico:', error);
  }

  console.log('\n✓ All favicon files generated!');
}

generateFavicons().catch(console.error);

