const fs = require('fs');
const path = require('path');

function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  console.error('Error: dist directory does not exist. Run vite build first.');
  process.exit(1);
}

// Gather all files in dist
const allFiles = walkDir(distDir);

// Filter out files we don't want to cache (like sourcemaps, sw.js itself, etc.)
const assetsToCache = allFiles
  .map(file => path.relative(distDir, file).replace(/\\/g, '/'))
  .filter(file => {
    // Don't cache sourcemaps or service worker itself
    if (file.endsWith('.map')) return false;
    if (file === 'sw.js') return false;
    return true;
  });

// Format as relative paths matching base url
const cacheList = [
  './',
  './index.html',
  './manifest.json',
  ...assetsToCache.map(file => `./${file}`)
];

// De-duplicate
const uniqueCacheList = [...new Set(cacheList)];

// Update sw.js in dist
const swPath = path.join(distDir, 'sw.js');
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf8');
  
  // Replace the STATIC_ASSETS array definition
  const staticAssetsRegex = /const\s+STATIC_ASSETS\s*=\s*\[[\s\S]*?\];/;
  const newArrayCode = `const STATIC_ASSETS = ${JSON.stringify(uniqueCacheList, null, 2)};`;
  
  swContent = swContent.replace(staticAssetsRegex, newArrayCode);
  fs.writeFileSync(swPath, swContent, 'utf8');
  console.log(`🚀 Successfully injected ${uniqueCacheList.length} assets into dist/sw.js for full offline support!`);
} else {
  console.error('Error: dist/sw.js not found!');
  process.exit(1);
}
