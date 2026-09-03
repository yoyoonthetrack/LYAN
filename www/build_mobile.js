const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

// Ensure destination exists and is clean
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir);

const filesToCopy = [
    'about.html',
    'how-it-works.html',
    'pricing.html',
    'results.html',
    'feed.html',
    'index.html',
    'style.css',
    'script.js',
    'api-client.js',
    'chat-logic.js',
    'dialog.js',
    'ai-agents.js',
    'ai-simulator.js',
    'payment-script.js',
    'notifications-service.js',
    'onboarding.js',
    'caribbean-mutual-help.png',
    'clim-talent.png',
    'david-34.png',
    'hero-image.png',
    'how-it-works-illustration.png',
    'huguette-68.png',
    'jardinage-talent.png',
    'kevin-41.png',
    'saint-louis-72.png',
    'sarah-29.png',
    'senior-menage-talent.png',
    'logo-app.png'
];

filesToCopy.forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${file} -> www/`);
    } else {
        console.warn(`Warning: File ${file} not found!`);
    }
});

console.log('Mobile build assets prepared successfully inside www/ directory.');
