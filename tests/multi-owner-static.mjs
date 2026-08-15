import fs from 'node:fs';
import vm from 'node:vm';

const installerPath = 'apps-script/OwnerTemplate.gs';
if (!fs.existsSync(installerPath)) throw new Error('Missing OwnerTemplate.gs');
const installer = fs.readFileSync(installerPath, 'utf8');
new vm.Script(installer, { filename: 'OwnerTemplate.gs' });

for (const name of ['setupOwnerInstance','configureOwnerInstance','getOwnerInstanceStatus','rotateOwnerAccessToken']) {
  if (!new RegExp(`function\\s+${name}\\s*\\(`).test(installer)) {
    throw new Error(`Missing multi-owner function: ${name}`);
  }
}

for (const key of ['OWNER_INSTANCE_ID','SPREADSHEET_ID','PROJECT_FOLDER_ID','RECEIPTS_FOLDER_ID','APP_ACCESS_TOKEN_HASH']) {
  if (!installer.includes(key)) throw new Error(`Missing owner isolation property: ${key}`);
}

if (!installer.includes('SpreadsheetApp.getActiveSpreadsheet()')) throw new Error('Owner installer must support bound Sheet copies');
if (!installer.includes('DriveApp.createFolder')) throw new Error('Owner installer must create isolated Drive workspace');
if (!installer.includes('SHA_256')) throw new Error('Owner installer must hash access tokens');

const config = fs.readFileSync('frontend/config.js', 'utf8');
for (const marker of ['palmApiUrl','multiOwner: true','palmOwnerPairingPending','localStorage.setItem(API_URL_STORAGE_KEY']) {
  if (!config.includes(marker)) throw new Error(`Missing frontend owner-pairing marker: ${marker}`);
}

if (!fs.existsSync('docs/MULTI_OWNER_SETUP.md')) throw new Error('Missing multi-owner setup guide');
const guide = fs.readFileSync('docs/MULTI_OWNER_SETUP.md', 'utf8');
if (!guide.includes('1 Owner = 1 Apps Script Deployment = 1 Sheet = 1 Drive workspace')) {
  throw new Error('Multi-owner isolation rule missing from guide');
}

console.log(JSON.stringify({
  ok: true,
  installerFunctions: 4,
  isolatedProperties: 5,
  frontendPairing: true
}, null, 2));
