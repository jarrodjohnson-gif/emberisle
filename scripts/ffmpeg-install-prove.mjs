import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const match = workflow.match(/      - if: needs\.changes\.outputs\.docs_only != 'true'\n        timeout-minutes: 6\n        run: \|\n((?:          .+\n)+)/);
assert.ok(match, 'bounded ffmpeg step exists');
const shell = match[1].replace(/^          /gm, '');
assert.match(shell, /command -v ffmpeg/);
for (const name of ['audio-level-prove', 'ambience-loop-prove']) {
  assert.ok(workflow.includes(`- if: needs.changes.outputs.docs_only != 'true'\n        run: npm run ${name}`), `${name} remains scheduled`);
}

function run(script, { installed = false, updateFailures = 0, installFailures = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ffmpeg-proof-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const executable = (name, contents) => {
      const path = join(bin, name);
      writeFileSync(path, contents);
      chmodSync(path, 0o755);
    };
    if (installed) executable('ffmpeg', '#!/bin/sh\nexit 0\n');
    executable('sleep', '#!/bin/sh\nprintf "sleep %s\\n" "$*" >> "$LOG"\n');
    executable('sudo', `#!/bin/sh
printf '%s\\n' "$*" >> "$LOG"
case "$*" in
  'timeout 90 apt-get -o Acquire::Retries=3 update')
    n=0; [ ! -f "$UPDATES" ] || read -r n < "$UPDATES"
    n=$((n + 1)); printf '%s\\n' "$n" > "$UPDATES"
    [ "$n" -gt "$UPDATE_FAILURES" ] ;;
  'timeout 150 apt-get -o Acquire::Retries=3 install -y --no-install-recommends ffmpeg')
    n=0; [ ! -f "$INSTALLS" ] || read -r n < "$INSTALLS"
    n=$((n + 1)); printf '%s\\n' "$n" > "$INSTALLS"
    if [ "$n" -gt "$INSTALL_FAILURES" ]; then
      printf '#!/bin/sh\\nexit 0\\n' > "$BIN/ffmpeg"
      /bin/chmod +x "$BIN/ffmpeg"
      exit 0
    fi
    exit 1 ;;
  *) exit 99 ;;
esac
`);
    const log = join(dir, 'calls');
    writeFileSync(log, '');
    const result = spawnSync('/bin/bash', ['-e', '-c', script], {
      encoding: 'utf8', env: { PATH: bin, BIN: bin, LOG: log, UPDATES: join(dir, 'updates'), INSTALLS: join(dir, 'installs'), UPDATE_FAILURES: String(updateFailures), INSTALL_FAILURES: String(installFailures) },
    });
    return { status: result.status, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const update = 'timeout 90 apt-get -o Acquire::Retries=3 update';
const install = 'timeout 150 apt-get -o Acquire::Retries=3 install -y --no-install-recommends ffmpeg';
const sleep = 'sleep 5';
function verify(script) {
  assert.deepEqual(run(script, { installed: true }), { status: 0, calls: [] });
  assert.deepEqual(run(script, { updateFailures: 1 }), { status: 0, calls: [update, sleep, update, install] });
  assert.deepEqual(run(script, { installFailures: 1 }), { status: 0, calls: [update, install, sleep, update, install] });
  assert.deepEqual(run(script, { updateFailures: 3 }), { status: 1, calls: [update, sleep, update, sleep, update, sleep] });
  assert.deepEqual(run(script, { installFailures: 3 }), { status: 1, calls: [update, install, sleep, update, install, sleep, update, install, sleep] });
}
verify(shell);
const mutation = shell.replace('in 1 2 3;', 'in 1;');
assert.notEqual(shell, mutation, 'negative control changes retry loop');
assert.throws(() => verify(mutation), 'one-attempt mutation must fail');
console.log('ffmpeg-install-prove: installed, transient failures, exhaustion, command bounds and retry negative control passed');
