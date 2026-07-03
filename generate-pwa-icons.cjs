/**
 * PWA Icon Generator
 * Run with: node generate-pwa-icons.cjs
 * Requires: npm install sharp
 * 
 * This script generates all required PWA icons from a source SVG.
 * If sharp is not installed, it creates placeholder PNGs.
 */

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, 'public', 'icons');
const SCREENSHOTS_DIR = path.join(__dirname, 'public', 'screenshots');

// Create directories
[ICONS_DIR, SCREENSHOTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// SVG source for the MiklensBio icon (flask with sprout + green fields)
const iconSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a8f5c"/>
      <stop offset="55%" stop-color="#1f9d8f"/>
      <stop offset="100%" stop-color="#1e5b8a"/>
    </linearGradient>
    <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8cc63f"/>
      <stop offset="100%" stop-color="#4caf50"/>
    </linearGradient>
    <linearGradient id="fieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#a8d98f"/>
      <stop offset="50%" stop-color="#4caf50"/>
      <stop offset="100%" stop-color="#2e7d32"/>
    </linearGradient>
    <linearGradient id="liquidGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#d4f1e0" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#a8d98f"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <path d="M212 120 L212 175 L150 320 C138 350 160 388 200 396 C230 402 282 402 312 396 C352 388 374 350 362 320 L300 175 L300 120 Z" fill="#ffffff" stroke="#ffffff" stroke-width="10" stroke-linejoin="round"/>
  <rect x="200" y="108" width="112" height="20" rx="10" fill="#ffffff"/>
  <clipPath id="flaskClip"><path d="M216 180 L162 318 C152 344 172 378 204 384 C232 389 280 389 308 384 C340 378 360 344 350 318 L296 180 Z"/></clipPath>
  <g clip-path="url(#flaskClip)">
    <rect x="150" y="180" width="212" height="130" fill="url(#liquidGrad)"/>
    <path d="M150 300 Q200 270 256 292 Q320 315 362 285 L362 400 L150 400 Z" fill="url(#fieldGrad)"/>
    <path d="M150 330 Q210 305 256 322 Q320 342 362 318 L362 400 L150 400 Z" fill="#2e7d32" opacity="0.55"/>
    <circle cx="230" cy="230" r="10" fill="#8cc63f" opacity="0.8"/>
    <circle cx="255" cy="210" r="7" fill="#a8d98f" opacity="0.8"/>
    <circle cx="245" cy="255" r="6" fill="#66bb6a" opacity="0.8"/>
  </g>
  <path d="M256 120 L256 80" stroke="#4caf50" stroke-width="10" stroke-linecap="round"/>
  <path d="M256 96 C270 40 330 30 372 44 C360 96 306 118 256 96 Z" fill="url(#leafGrad)" stroke="#ffffff" stroke-width="8" stroke-linejoin="round"/>
  <path d="M256 104 C238 58 190 52 156 66 C168 110 214 128 256 104 Z" fill="url(#leafGrad)" stroke="#ffffff" stroke-width="8" stroke-linejoin="round"/>
</svg>`;

// Try to use sharp, otherwise use placeholder approach
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('Sharp not installed. Run: npm install sharp');
  console.log('Creating placeholder icon files instead...\n');
  sharp = null;
}

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
  { name: 'icon-310x150.png', size: 310 }, // Wide icon
  { name: 'icon-384x384.png', size: 384 },
  { name: 'icon-512x512.png', size: 512 },
];

async function generateIcons() {
  if (sharp) {
    const svgBuffer = Buffer.from(iconSvg);
    
    for (const { name, size } of iconSizes) {
      try {
        if (name.includes('310x150')) {
          // Wide tile - create rectangular version
          await sharp(svgBuffer)
            .resize(310, 150)
            .png()
            .toFile(path.join(ICONS_DIR, name));
        } else {
          await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(path.join(ICONS_DIR, name));
        }
        console.log(`✓ Created ${name}`);
      } catch (err) {
        console.error(`✗ Failed to create ${name}:`, err.message);
      }
    }
    
    // Create favicon.svg
    fs.writeFileSync(path.join(__dirname, 'public', 'favicon.svg'), iconSvg);
    console.log('✓ Created favicon.svg');
    
  } else {
    // Create placeholder files with proper headers (1x1 transparent PNG)
    // These are minimal placeholders - in production, install sharp
    const minimalPng = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    for (const { name } of iconSizes) {
      fs.writeFileSync(path.join(ICONS_DIR, name), minimalPng);
    }
    console.log('Created placeholder icons (install sharp for production icons)');
  }
  
  // Copy SVG for use as favicon
  const svgPath = path.join(__dirname, 'public', 'favicon.svg');
  if (!fs.existsSync(svgPath)) {
    fs.writeFileSync(svgPath, iconSvg);
  }
  
  console.log('\n✅ Icon generation complete!');
  console.log('Icons saved to:', ICONS_DIR);
}

generateIcons().catch(console.error);