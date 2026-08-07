const path = require('path');
const fs = require('fs');

(async () => {
  const workflowPath = path.resolve(__dirname, '../n8n-workflow-template.json');
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

  console.log('Checking local n8n instance connection...');
  try {
    const res = await fetch('http://localhost:5678/api/v1/owner');
    console.log(`Connection test status: ${res.status}`);
    const data = await res.json();
    console.log('Owner details:', data);
  } catch (err) {
    console.log('Owner check failed or unauthorized:', err.message);
  }

  console.log('Trying to find existing workflows...');
  try {
    const res = await fetch('http://localhost:5678/api/v1/workflows');
    console.log(`Workflows fetch status: ${res.status}`);
    const data = await res.json();
    console.log('Workflows list:', data);
  } catch (err) {
    console.log('Workflows list failed:', err.message);
  }
})();
