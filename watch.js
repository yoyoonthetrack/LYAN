const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('👀 Observateur de fichiers démarré. En attente de modifications...');

let timeout = null;
const watchDir = __dirname;
const ignoreList = ['www', 'ios', 'android', 'node_modules', '.git', '.node-portable', 'watch.js', 'package-lock.json', 'package.json'];

fs.watch(watchDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    // Ignorer les dossiers système et de build
    const isIgnored = ignoreList.some(ignore => 
        filename.startsWith(ignore) || 
        filename.includes(`/${ignore}/`) || 
        filename.includes(`\\${ignore}\\`)
    );
    if (isIgnored) return;

    console.log(`📝 Fichier modifié : ${filename}`);

    // Anti-rebond (debounce) de 500ms
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
        console.log('🔄 Lancement de la reconstruction et de la synchronisation...');
        exec('node build_mobile.js && npx cap sync', { cwd: watchDir }, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Erreur de synchronisation : ${error.message}`);
                return;
            }
            console.log('✅ Synchronisation mobile effectuée avec succès !');
        });
    }, 500);
});
