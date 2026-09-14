const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'script.js');
const changes = [];

function normalizeLegacyProfileLoader() {
  if (!fs.existsSync(scriptPath)) throw new Error('script.js not found');
  let source = fs.readFileSync(scriptPath, 'utf8');

  const functionStart = source.indexOf('async function openPublicMemberProfile(memberId, entryPoint) {');
  if (functionStart === -1) throw new Error('openPublicMemberProfile not found');

  const replacementStart = source.indexOf('        let activeUserId = null;', functionStart);
  const replacementEnd = source.indexOf("        console.log('[PROFILE_RECOVERY] authUserId:', activeUserId);", replacementStart);

  if (replacementStart === -1 || replacementEnd === -1 || replacementEnd <= replacementStart) {
    if (source.includes('window.LYANN_PROFILE_REPOSITORY.load(memberId)')) return;
    throw new Error('profile loader normalization markers not found');
  }

  const replacement = `        if (!window.LYANN_PROFILE_REPOSITORY) {\n            throw new Error('LYANN_PROFILE_REPOSITORY is not available');\n        }\n\n        const profileBundle = await window.LYANN_PROFILE_REPOSITORY.load(memberId);\n        memberId = profileBundle.memberId;\n        const activeUserId = profileBundle.activeUserId;\n        const isSelf = profileBundle.isSelf;\n        const profileData = profileBundle.profileData;\n        const portfolioItems = profileBundle.portfolioItems;\n        const userServices = profileBundle.userServices;\n        const reviewsList = profileBundle.reviewsList;\n        const dbProfileFound = profileBundle.dbProfileFound;\n\n`;

  source = source.slice(0, replacementStart) + replacement + source.slice(replacementEnd);
  fs.writeFileSync(scriptPath, source, 'utf8');
  changes.push('consolidate openPublicMemberProfile data loading');
}

function wireProfileRepository() {
  const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));
  for (const file of htmlFiles) {
    const filePath = path.join(root, file);
    let html = fs.readFileSync(filePath, 'utf8');
    if (!html.includes('<script src="script.js')) continue;
    if (html.includes('<script src="profile-repository.js"></script>')) continue;

    const dataCacheTag = '<script src="data-cache.js"></script>';
    const scriptTagIndex = html.indexOf('<script src="script.js');
    if (html.includes(dataCacheTag)) {
      html = html.replace(dataCacheTag, `${dataCacheTag}\n    <script src="profile-repository.js"></script>`);
    } else if (scriptTagIndex !== -1) {
      const lineStart = html.lastIndexOf('\n', scriptTagIndex) + 1;
      const indent = html.slice(lineStart, scriptTagIndex);
      html = html.slice(0, lineStart) + `${indent}<script src="profile-repository.js"></script>\n` + html.slice(lineStart);
    }

    fs.writeFileSync(filePath, html, 'utf8');
    changes.push(`wire profile-repository.js into ${file}`);
  }
}

normalizeLegacyProfileLoader();
wireProfileRepository();

if (!changes.length) console.log('Profile loader normalization already applied; no changes.');
else console.log(`Applied profile loader normalization: ${changes.join(', ')}`);
