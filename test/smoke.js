const assert = require('assert');
const fs = require('fs');
const http = require('http');
const vscode = require('vscode');

function log(line) {
  const file = process.env.NEUROCODE_SMOKE_LOG;
  if (file) fs.appendFileSync(file, line + '\n');
  console.log(line);
}

/**
 * Extension-host smoke test. Confirms activation, the sidebar command,
 * project scan, and offline test generation against test/fixture.
 */
async function run() {
  try {
    await smoke();
  } catch (err) {
    log(`[NeuroCode smoke] FAIL ${err instanceof Error ? err.stack : String(err)}`);
    throw err;
  }
}

async function smoke() {
  const ext = vscode.extensions.getExtension('neurocode.neurocode');
  assert.ok(ext, 'NeuroCode extension was not found');
  await ext.activate();

  const commands = await vscode.commands.getCommands(true);
  for (const id of [
    'neurocode.scanProject',
    'neurocode.generateTests',
    'neurocode.runTests',
    'neurocode.showDashboard',
    'neurocode.exportReport',
    'neurocode.rerunFailed',
  ]) {
    assert.ok(commands.includes(id), `missing command ${id}`);
  }

  const info = [];
  const errors = [];
  const originalInfo = vscode.window.showInformationMessage;
  const originalWarn = vscode.window.showWarningMessage;
  const originalError = vscode.window.showErrorMessage;
  vscode.window.showInformationMessage = (message, ...rest) => {
    info.push(String(message));
    return originalInfo.call(vscode.window, message, ...rest);
  };
  vscode.window.showWarningMessage = (message, ...rest) => {
    info.push(String(message));
    return originalWarn.call(vscode.window, message, ...rest);
  };
  vscode.window.showErrorMessage = (message, ...rest) => {
    errors.push(String(message));
    return originalError.call(vscode.window, message, ...rest);
  };

  await vscode.commands.executeCommand('neurocode.showDashboard');
  await vscode.commands.executeCommand('neurocode.scanProject');
  const detected = info.find((m) => m.includes('detected'));
  assert.ok(detected, `scan did not report a project type. messages=${info.join(' | ')} errors=${errors.join(' | ')}`);
  assert.match(detected, /detected api project/i);

  await vscode.commands.executeCommand('neurocode.generateTests');
  const generated = info.find((m) => m.includes('generated'));
  assert.ok(generated, `generate did not report test cases. messages=${info.join(' | ')} errors=${errors.join(' | ')}`);
  const count = Number(generated.match(/generated (\d+)/)?.[1]);
  assert.ok(count > 0, `expected generated tests, got: ${generated}`);

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const empty = body === '' || body === '{}';
      const status = req.method === 'POST' && empty ? 422 : 200;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: status === 200 }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(3000, '127.0.0.1', resolve);
  });

  try {
    await vscode.commands.executeCommand('neurocode.runTests');
  } finally {
    if (process.env.NEUROCODE_KEEP_OPEN !== '1') {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  const ran = info.find((m) => m.includes('passed'));
  assert.ok(ran, `run did not report results. messages=${info.join(' | ')} errors=${errors.join(' | ')}`);
  assert.deepEqual(errors, [], `unexpected errors: ${errors.join(' | ')}`);

  log(`[NeuroCode smoke] ${detected}`);
  log(`[NeuroCode smoke] ${generated}`);
  log(`[NeuroCode smoke] ${ran}`);

  if (process.env.NEUROCODE_KEEP_OPEN === '1') {
    log('[NeuroCode smoke] window left open');
    await new Promise(() => {});
  }
}

module.exports = { run };
