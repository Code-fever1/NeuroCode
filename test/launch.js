const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'neurocode-ud-'));
const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neurocode-ext-'));
const fixture = path.join(root, 'test', 'fixture');

const args = [
  '--user-data-dir', userData,
  '--extensions-dir', extensionsDir,
  '--extensionDevelopmentPath', root,
  '--extensionTestsPath', path.join(root, 'test', 'smoke.js'),
  '--disable-extensions',
  '--disable-workspace-trust',
  '--skip-welcome',
  '--skip-release-notes',
  fixture,
];

const logFile = path.join(os.tmpdir(), 'neurocode-smoke.log');
fs.writeFileSync(logFile, '');

const child = spawn('/usr/share/code/code', args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    DONT_PROMPT_WSL_INSTALL: '1',
    NEUROCODE_SMOKE_LOG: logFile,
  },
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
