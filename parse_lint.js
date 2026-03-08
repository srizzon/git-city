const fs = require('fs');
const eslint = require('child_process').execSync('npx eslint src/app/page.tsx -f json', { encoding: 'utf-8', maxBuffer: 1024 * 1024 });

try {
  const reports = JSON.parse(eslint);
  reports.forEach(r => {
    r.messages.forEach(m => {
      console.log(`L${m.line}:${m.column} - [${m.ruleId}] ${m.message}`);
    });
  });
} catch(e) { /* eslint exit code 1 throws */ }
