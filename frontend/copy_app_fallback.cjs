const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, 'dist');
const indexPath = path.join(distDir, 'index.html');
const appDir = path.join(distDir, 'app');

if (fs.existsSync(indexPath)) {
  fs.mkdirSync(appDir, { recursive: true });
  fs.copyFileSync(indexPath, path.join(appDir, 'index.html'));
  console.log('✓ SPA fallback created at dist/app/index.html');
}
