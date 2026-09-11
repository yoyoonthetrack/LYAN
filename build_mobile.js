const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');
const hygieneScriptTag = '<script src="production-hygiene.js?v=20260911" defer></script>';

function injectProductionHygiene(filePath) {
    if (path.extname(filePath).toLowerCase() !== '.html' || !fs.existsSync(filePath)) return;

    let html = fs.readFileSync(filePath, 'utf8');
    if (html.includes('production-hygiene.js')) return;

    html = html.includes('</body>')
        ? html.replace('</body>', `    ${hygieneScriptTag}\n</body>`)
        : `${html}\n${hygieneScriptTag}\n`;

    fs.writeFileSync(filePath, html, 'utf8');
}

// Ensure destination exists and is clean
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
if (fs.mkdirSync) {
    fs.mkdirSync(destDir, { recursive: true });
}

// Find all HTML, JS, CSS, JSON, PNG, JPG files in root
const filesInRoot = fs.readdirSync(srcDir);
const filesToCopy = filesInRoot.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp'].includes(ext);
});

filesToCopy.forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    try {
        if (fs.statSync(srcPath).isFile()) {
            fs.copyFileSync(srcPath, destPath);
            injectProductionHygiene(destPath);
            console.log(`Copied ${file} -> www/`);
        }
    } catch (e) {
        console.warn(`Warning: Could not copy ${file}:`, e.message);
    }
});

// Also copy to Capacitor public folders if they exist
const iosPublic = path.join(__dirname, 'ios', 'App', 'App', 'public');
const androidPublic = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');

[iosPublic, androidPublic].forEach(capDest => {
    if (fs.existsSync(path.dirname(capDest))) {
        if (fs.existsSync(capDest)) {
            fs.rmSync(capDest, { recursive: true, force: true });
        }
        fs.mkdirSync(capDest, { recursive: true });
        filesToCopy.forEach(file => {
            const srcPath = path.join(srcDir, file);
            const destPath = path.join(capDest, file);
            try {
                if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
                    fs.copyFileSync(srcPath, destPath);
                    injectProductionHygiene(destPath);
                }
            } catch (e) {
                console.warn(`Warning: Could not sync ${file} to ${capDest}:`, e.message);
            }
        });
        console.log(`Synced to ${capDest}`);
    }
});

console.log('Mobile build assets prepared, production-hygiene injected, and synced successfully!');
