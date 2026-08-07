const fs = require('fs');
const path = require('path');

// Helper function to read .env file manually without requiring external dependency
function loadEnvFile() {
  try {
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const separatorIdx = trimmed.indexOf('=');
          if (separatorIdx !== -1) {
            const key = trimmed.substring(0, separatorIdx).trim();
            let value = trimmed.substring(separatorIdx + 1).trim();
            // Strip wrapping quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.substring(1, value.length - 1);
            }
            process.env[key] = value;
          }
        }
      });
    }
  } catch (e) {
    console.warn('Could not read .env file:', e.message);
  }
}

class N8nReporter {
  constructor() {
    this.tests = [];
    loadEnvFile();
  }

  onTestEnd(test, result) {
    this.tests.push({
      title: test.title,
      file: test.location.file ? test.location.file.split(/[/\\]/).pop() : 'unknown',
      status: result.status, // 'passed', 'failed', 'timedout', 'skipped'
      durationMs: result.duration,
      errorMessage: result.error ? result.error.message : null
    });
  }

  async onEnd(result) {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) {
      console.log('\n================================================================');
      console.log('📢 n8n Integration: N8N_WEBHOOK_URL is not set in your .env file.');
      console.log('Skipping webhook payload delivery.');
      console.log('To enable n8n alerts, create a .env file and set: N8N_WEBHOOK_URL=http://...');
      console.log('================================================================\n');
      return;
    }

    const passedCount = this.tests.filter(t => t.status === 'passed').length;
    const failedCount = this.tests.filter(t => t.status === 'failed' || t.status === 'timedout').length;

    const payload = {
      timestamp: new Date().toISOString(),
      runStatus: result.status, // 'passed' or 'failed'
      totalTests: this.tests.length,
      passed: passedCount,
      failed: failedCount,
      durationMs: result.duration,
      projectName: 'Concrete2You E2E Automation',
      tests: this.tests
    };

    console.log(`\n======================================================`);
    console.log(`🚀 Sending test results summary to n8n Webhook...`);
    console.log(`Payload status: ${payload.runStatus.toUpperCase()} (Passed: ${payload.passed}, Failed: ${payload.failed})`);
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log(`n8n Webhook: Payload delivered successfully. Status code: ${response.status}`);
      console.log(`======================================================\n`);
    } catch (err) {
      console.error(`n8n Webhook: Connection failed: ${err.message}`);
      console.log(`======================================================\n`);
    }
  }
}

module.exports = N8nReporter;
