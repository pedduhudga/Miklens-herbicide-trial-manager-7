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

// SVG source for the icon (green gradient with flask symbol)
const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#059669"/>
      <stop offset="100%" style="stop-color:#047857"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <g fill="none" stroke="white" stroke-width="24" stroke-linecap="round" stroke-linejoin="round">
    <!-- Flask body -->
    <path d="M176 160 L256 96 L336 160 L336 400 C336 424 288 448 256 448 C224 448 176 424 176 400 Z"/>
    <!-- Flask neck -->
    <path d="M220 160 L220 112 L292 112 L292 160"/>
    <!-- Liquid -->
    <path d="M196 320 C196 350 220 380 256 380 C292 380 316 350 316 320" stroke="#34d399" stroke-width="20"/>
    <!-- Bubbles -->
    <circle cx="236" cy="280" r="12" fill="#34d399" stroke="none"/>
    <circle cx="276" cy="300" r="8" fill="#34d399" stroke="none"/>
    <circle cx="256" cy="250" r="10" fill="#34d399" stroke="none"/>
  </g>
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