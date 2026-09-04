const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

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
    if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${file} -> www/`);
    }
});

// Also copy to Capacitor public folders if they exist
const iosPublic = path.join(__dirname, 'ios', 'App', 'App', 'public');
const androidPublic = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');

[iosPublic, androidPublic].forEach(capDest => {
    if (fs.existsSync(path.dirname(capDest))) {
        if (!fs.existsSync(capDest)) fs.mkdirSync(capDest, { recursive: true });
        filesToCopy.forEach(file => {
            const srcPath = path.join(srcDir, file);
            if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
                fs.copyFileSync(srcPath, path.join(capDest, file));
            }
        });
        console.log(`Synced to ${capDest}`);
    }
});

console.log('Mobile build assets prepared and synced successfully!');

