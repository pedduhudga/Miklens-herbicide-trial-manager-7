const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE_IMAGE = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\5c9bcc3b-63c8-41f9-842b-48f30fa4ae51\\media__1783103314487.jpg';
const ICONS_DIR = path.join(__dirname, 'public', 'icons');

async function main() {
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error('Source image not found at:', SOURCE_IMAGE);
    process.exit(1);
  }

  console.log('Using source image:', SOURCE_IMAGE);

  // Define target sizes
  const iconSizes = [
    { name: 'icon-16x16.png', size: 16 },
    { name: 'icon-32x32.png', size: 32 },
    { name: 'icon-72x72.png', size: 72 },
    { name: 'icon-96x96.png', size: 96 },
    { name: 'icon-128x128.png', size: 128 },
    { name: 'icon-144x144.png', size: 144 },
    { name: 'icon-150x150.png', size: 150 },
    { name: 'icon-152x152.png', size: 152 },
    { name: 'icon-167x167.png', size: 167 },
    { name: 'icon-180x180.png', size: 180 },
    { name: 'icon-192x192.png', size: 192 },
    { name: 'icon-310x310.png', size: 310 },
    { name: 'icon-384x384.png', size: 384 },
    { name: 'icon-512x512.png', size: 512 },
  ];

  // Ensure output directory exists
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  // Generate PNG icons
  for (const { name, size } of iconSizes) {
    await sharp(SOURCE_IMAGE)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toFile(path.join(ICONS_DIR, name));
    console.log(`Generated: public/icons/${name}`);
  }

  // Generate wide rectangular icon (310x150)
  await sharp(SOURCE_IMAGE)
    .resize(310, 150, { fit: 'cover' })
    .png()
    .toFile(path.join(ICONS_DIR, 'icon-310x150.png'));
  console.log('Generated: public/icons/icon-310x150.png');

  // Generate PNG buffer for base64 SVG embedding
  const png512Buffer = await sharp(SOURCE_IMAGE)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toBuffer();
  
  const base64Png = png512Buffer.toString('base64');

  // Wrap PNG inside a valid SVG file so it looks perfect as an SVG resource
  const svgWrapper = `<svg width="512" height="512" version="1.1" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <image width="512" height="512" xlink:href="data:image/png;base64,${base64Png}"/>
</svg>`;

  fs.writeFileSync(path.join(__dirname, 'public', 'favicon.svg'), svgWrapper, 'utf8');
  console.log('Generated SVG wrapped favicon: public/favicon.svg');

  console.log('Icon update complete!');
}

main().catch(console.error);
