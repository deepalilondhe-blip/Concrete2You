const fs = require('fs');
const elements = JSON.parse(fs.readFileSync('scratch/elements.json', 'utf8'));

console.log('--- Links/Buttons containing "Account" or related classes ---');
const filtered = elements.filter(el => {
  const text = el.text.toLowerCase();
  const cls = el.className.toLowerCase();
  const id = el.id.toLowerCase();
  return text.includes('account') || text.includes('sign') || text.includes('log') || 
         cls.includes('account') || cls.includes('login') || cls.includes('authorization') ||
         id.includes('account') || id.includes('login') || id.includes('authorization');
});

console.log(JSON.stringify(filtered, null, 2));
