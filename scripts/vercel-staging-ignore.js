'use strict';

// Vercel skips the build when this process exits 0, and builds when it exits 1.
const name = String(process.env.VERCEL_PROJECT_NAME || process.env.VERCEL_PROJECT_ID || '');
const productionNames = new Set(['lyan-app', 'lyann-app', 'lyann']);
if (productionNames.has(name)) {
    console.log('Build ignoré : ce fichier de configuration ne doit pas construire le projet Production.');
    process.exit(0);
}
process.exit(1);
