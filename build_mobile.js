const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');
const hygieneScriptTag = '<script src="production-hygiene.js?v=20260911" defer></script>';

function sanitizeStaticHtml(html) {
    let out = html;

    out = out.replace(
        /\n\s*<!-- ========== SECTION 5 : TALENTS DE NOS ÎLES ========== -->[\s\S]*?(?=\n\s*<!-- ========== SECTION 6 : TÉMOIGNAGES ========== -->)/,
        '\n'
    );
    out = out.replace(
        /\n\s*<!-- ========== SECTION 6 : TÉMOIGNAGES ========== -->[\s\S]*?(?=\n\s*<!-- ========== SECTION APERÇU : BOKANTAJ EN DIRECT ========== -->)/,
        '\n'
    );

    out = out.replace(/<span class="photo-category-sub">\s*\d+\s+(?:artisans?|passionnés?|électriciens?|plombiers?|accompagnateurs?)[^<]*<\/span>/gi,
        '<span class="photo-category-sub">Explorer cette activité</span>');

    out = out
        .replace(/Coup de pouce/g, 'Service de confiance')
        .replace(/coup de pouce/g, 'service de confiance')
        .replace(/\s*\(Simulé\)/gi, '')
        .replace(/Bonjour David\b/g, 'Bonjour');

    const markers = ['David.M', 'Tati Huguette', 'Zone de Test'];
    for (const marker of markers) {
        const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const divCard = new RegExp(`<div\\b[^>]*class="[^"]*(?:card|demo|test)[^"]*"[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/div>`, 'gi');
        const article = new RegExp(`<article\\b[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/article>`, 'gi');
        out = out.replace(divCard, '').replace(article, '');
    }

    return out;
}

function sanitizeAndInjectProductionHygiene(filePath) {
    if (path.extname(filePath).toLowerCase() !== '.html' || !fs.existsSync(filePath)) return;

    let html = sanitizeStaticHtml(fs.readFileSync(filePath, 'utf8'));
    if (!html.includes('production-hygiene.js')) {
        html = html.includes('</body>')
            ? html.replace('</body>', `    ${hygieneScriptTag}\n</body>`)
            : `${html}\n${hygieneScriptTag}\n`;
    }

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
            sanitizeAndInjectProductionHygiene(destPath);
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
                    sanitizeAndInjectProductionHygiene(destPath);
                }
            } catch (e) {
                console.warn(`Warning: Could not sync ${file} to ${capDest}:`, e.message);
            }
        });
        console.log(`Synced to ${capDest}`);
    }
});

console.log('Mobile build assets prepared, static demo fixtures sanitized, production-hygiene injected, and synced successfully!');
