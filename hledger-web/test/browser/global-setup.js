// Start hledger-web for the browser test run, on a scratch copy of fixture.journal
// (tests add and edit transactions, so the journal must be disposable).
//
// The binary is located by, in order:
//   1. $HLEDGER_WEB (a command, may contain spaces, e.g. "stack exec -- hledger-web")
//   2. `stack exec -- hledger-web` if a stack project is detected two dirs up
//   3. plain `hledger-web` from $PATH
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = process.env.HLEDGER_WEB_PORT || '5099';
const URL = process.env.HLEDGER_WEB_URL || `http://127.0.0.1:${PORT}`;

function serverCommand() {
  if (process.env.HLEDGER_WEB) return process.env.HLEDGER_WEB.split(/\s+/);
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  if (fs.existsSync(path.join(repoRoot, 'stack.yaml')))
    return ['stack', 'exec', '--', 'hledger-web'];
  return ['hledger-web'];
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (function poll() {
      http.get(url + '/journal', res => {
        res.resume();
        res.statusCode < 500 ? resolve() : retry();
      }).on('error', retry);
      function retry() {
        if (Date.now() > deadline) return reject(new Error(`hledger-web did not start at ${url}`));
        setTimeout(poll, 300);
      }
    })();
  });
}

module.exports = async () => {
  const journal = path.join(os.tmpdir(), `hledger-web-browser-${process.pid}.journal`);
  fs.copyFileSync(path.join(__dirname, 'fixture.journal'), journal);
  process.env.BROWSER_JOURNAL = journal;

  const [cmd, ...args] = serverCommand();
  const child = spawn(cmd, [...args,
    '-f', journal, '--serve', '--host', '127.0.0.1', '--port', PORT, '--allow=edit',
  ], { stdio: 'ignore', detached: true });
  child.unref();
  fs.writeFileSync(path.join(os.tmpdir(), 'hledger-web-browser.pid'), String(child.pid));

  await waitForServer(URL, 60000);
};
