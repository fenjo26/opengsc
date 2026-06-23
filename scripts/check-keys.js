const fs = require('fs');
const path = require('path');

const enPath = path.resolve(__dirname, '../src/locales/en.json');
const ruPath = path.resolve(__dirname, '../src/locales/ru.json');
const ukPath = path.resolve(__dirname, '../src/locales/uk.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
const uk = JSON.parse(fs.readFileSync(ukPath, 'utf8'));

const enKeys = Object.keys(en);
const ruKeys = Object.keys(ru);
const ukKeys = Object.keys(uk);

console.log(`en.json has ${enKeys.length} keys.`);
console.log(`ru.json has ${ruKeys.length} keys.`);
console.log(`uk.json has ${ukKeys.length} keys.`);

const allKeys = new Set([...enKeys, ...ruKeys, ...ukKeys]);

let hasMismatch = false;

allKeys.forEach(key => {
  const inEn = enKeys.includes(key);
  const inRu = ruKeys.includes(key);
  const inUk = ukKeys.includes(key);

  if (!inEn || !inRu || !inUk) {
    hasMismatch = true;
    console.log(`Mismatch on key "${key}": EN=${inEn}, RU=${inRu}, UK=${inUk}`);
  }
});

if (!hasMismatch) {
  console.log('All three files are perfectly synchronized with identical keys!');
} else {
  console.log('Mismatch detected between translation files.');
}
