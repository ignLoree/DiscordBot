const fs = require('fs');
const path = require('path');

const prefixDir = path.join(__dirname, '..', 'Prefix');
const oldName = path.join(prefixDir, 'Utiliy');
const newName = path.join(prefixDir, 'Utility');

if (!fs.existsSync(oldName)) {
  console.log('Folder Utiliy not found, nothing to do.');
  process.exit(0);
}
if (fs.existsSync(newName)) {
  console.log('Folder Utility already exists.');
  process.exit(1);
}
fs.renameSync(oldName, newName);
console.log('Renamed Utiliy -> Utility');
