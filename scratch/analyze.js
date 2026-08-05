const fs = require('fs');

const content = fs.readFileSync('scratch/page_source.html', 'utf8');

// Find all matches for links (a tags) containing account/login or has class/id related
const linkRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
let match;
console.log('--- A TAGS MATCHING ACCOUNT/LOGIN ---');
while ((match = linkRegex.exec(content)) !== null) {
  const href = match[1];
  const innerText = match[2].replace(/<[^>]*>/g, '').trim();
  const outer = match[0].substring(0, 200);
  if (href.includes('account') || href.includes('login') || innerText.toLowerCase().includes('account') || innerText.toLowerCase().includes('sign')) {
    console.log(`Href: ${href} | Text: ${innerText} | Outer: ${outer}`);
  }
}

// Print any div or button with class/id matching login, account, popup, cookie, consent
console.log('\n--- ELEMENTS MATCHING COOKIE / CONSENT / POPUP ---');
const tagRegex = /<([a-z0-9]+)\s+([^>]*)(id|class)=["']([^"']*(cookie|consent|popup|dialog|banner|modal)[^"']*)["'][^>]*>/gi;
while ((match = tagRegex.exec(content)) !== null) {
  console.log(`Tag: ${match[1]} | Attribute: ${match[2]} | Val: ${match[4]}`);
}
