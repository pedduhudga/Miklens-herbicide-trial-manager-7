#!/usr/bin/env node

// PWA Validation Script
import fs from 'fs';
import path from 'path';

const checks = [];

function addCheck(name, status, message) {
  checks.push({ name, status, message });
}

function validateFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    addCheck(description, '✅', `Found: ${filePath}`);
    return true;
  } else {
    addCheck(description, '❌', `Missing: ${filePath}`);
    return false;
  }
}

function validateJSON(filePath, description) {
  if (!validateFile(filePath, description)) return false;
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
    addCheck(`${description} (Valid JSON)`, '✅', 'JSON syntax is valid');
    return true;
  } catch (error) {
    addCheck(`${description} (Valid JSON)`, '❌', `JSON syntax error: ${error.message}`);
    return false;
  }
}

function validateManifest() {
  const manifestPath = 'public/manifest.json';
  if (!validateJSON(manifestPath, 'PWA Manifest')) return;
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Check required fields
    const requiredFields = ['name', 'short_name', 'start_url', 'display', 'icons'];
    requiredFields.forEach(field => {
      if (manifest[field]) {
        addCheck(`Manifest.${field}`, '✅', `Present: ${manifest[field]}`);
      } else {
        addCheck(`Manifest.${field}`, '❌', 'Missing required field');
      }
    });
    
  } catch (error) {
    addCheck('Manifest Validation', '❌', error.message);
  }
}

function validateServiceWorker() {
  const swPath = 'public/sw.js';
  if (!validateFile(swPath, 'Service Worker')) return;
  
  const content = fs.readFileSync(swPath, 'utf8');
  
  // Check for key service worker features
  const features = [
    ['Install Event', /addEventListener\s*\(\s*['"](install)['"]/, 'Handles app installation'],
    ['Activate Event', /addEventListener\s*\(\s*['"](activate)['"]/, 'Handles app activation'],
    ['Fetch Event', /addEventListener\s*\(\s*['"](fetch)['"]/, 'Handles network requests'],
    ['Cache API', /caches\.(open|match|keys)/, 'Implements caching']
  ];
  
  features.forEach(([name, regex, description]) => {
    if (regex.test(content)) {
      addCheck(`SW: ${name}`, '✅', description);
    } else {
      addCheck(`SW: ${name}`, '⚠️', `Missing: ${description}`);
    }
  });
}

function validateHTML() {
  const htmlPath = 'index.html';
  if (!validateFile(htmlPath, 'Main HTML')) return;
  
  const content = fs.readFileSync(htmlPath, 'utf8');
  
  // Check for PWA meta tags
  const tags = [
    ['Manifest Link', /<link[^>]*rel=['"](manifest)['"]/, 'Links to manifest.json'],
    ['Theme Color', /<meta[^>]*name=['"](theme-color)['"]/, 'Sets app theme color'],
    ['Apple Mobile Capable', /<meta[^>]*name=['"](apple-mobile-web-app-capable)['"]/, 'iOS PWA support'],
    ['Viewport Meta', /<meta[^>]*name=['"](viewport)['"]/, 'Mobile responsive']
  ];
  
  tags.forEach(([name, regex, description]) => {
    if (regex.test(content)) {
      addCheck(`HTML: ${name}`, '✅', description);
    } else {
      addCheck(`HTML: ${name}`, '❌', `Missing: ${description}`);
    }
  });
}

function validateSWRegistration() {
  const mainPath = 'src/main.jsx';
  if (!validateFile(mainPath, 'Main JS Entry')) return;
  
  const content = fs.readFileSync(mainPath, 'utf8');
  
  if (/serviceWorker.*register/i.test(content)) {
    addCheck('SW Registration', '✅', 'Service worker registration found');
  } else {
    addCheck('SW Registration', '❌', 'Service worker registration missing');
  }
}

function validateIcons() {
  const iconPath = 'public/favicon.svg';
  validateFile(iconPath, 'App Icon');
}

function printResults() {
  console.log('\n🔍 PWA Validation Results\n' + '='.repeat(50));
  
  let passed = 0;
  let total = checks.length;
  
  checks.forEach(check => {
    const status = check.status === '✅' ? '✅ PASS' : 
                   check.status === '⚠️' ? '⚠️  WARN' : '❌ FAIL';
    console.log(`${status} ${check.name}`);
    console.log(`     ${check.message}\n`);
    
    if (check.status === '✅') passed++;
  });
  
  console.log('='.repeat(50));
  console.log(`📊 Score: ${passed}/${total} checks passed (${Math.round(passed/total*100)}%)`);
  
  if (passed === total) {
    console.log('🎉 PWA setup is complete and ready!');
  } else if (passed >= total * 0.8) {
    console.log('👍 PWA setup is mostly complete. Fix remaining issues for best experience.');
  } else {
    console.log('⚠️  PWA setup needs attention. Please fix the failed checks.');
  }
  
  console.log('\n📖 For detailed setup instructions, see PWA_SETUP_GUIDE.md');
}

// Run validation
console.log('🚀 Validating PWA setup...');

validateManifest();
validateServiceWorker();
validateHTML();
validateSWRegistration();
validateIcons();

printResults();