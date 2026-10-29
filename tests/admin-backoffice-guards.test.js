const fs = require('fs');
const path = require('path');
const assert = require('assert');

const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
const adminScript = fs.readFileSync(path.join(__dirname, '../admin-script.js'), 'utf8');
const aiAgents = fs.readFileSync(path.join(__dirname, '../ai-agents.js'), 'utf8');

assert.match(server, /FINANCIAL_LOCK_PROTECTED/);
assert.match(server, /Collecte éditoriale interdite sur Production/);
assert.doesNotMatch(server, /INITIAL_FLASH_POSTS/);
assert.match(server, /draft === true/);
assert.match(server, /verifyAdminPermission\(req, 'settings.manage'\)/);
assert.match(server, /app\.post\('\/v1\/admin\/ops\/team'/);
assert.match(server, /app\.patch\('\/v1\/admin\/ops\/team\/:id'/);
assert.match(server, /verifyAdminPermission\(req, 'team\.manage'\)/);
assert.match(server, /OWNER et SUPER_ADMIN ne se donnent pas ici/);
assert.match(server, /Ce rôle ne se modifie pas ici/);
assert.match(aiAgents, /Aucune file en mémoire/);
assert.doesNotMatch(aiAgents, /INITIAL_FLASH_POSTS/);
assert.match(adminScript, /Générer maintenant|editorialCollectBtn/);
assert.match(adminScript, /lifecycle_label/);
assert.match(adminScript, /Les commissions et verrous financiers ne peuvent pas être modifiés/);
console.log('admin-backoffice-guards: ok');
