// #1198: keep the README host-test inventory aligned with the command npm test actually runs.
import assert from 'node:assert/strict';
import { accessSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function check(readme, testScript, hasFile = (name) => {
  try { accessSync(join(root, 'server', name)); return true; } catch { return false; }
}) {
  const inventory = readme.match(/`npm test` runs the (\d+) host proofs in the sequence in `server\/package\.json` \(`scripts\.test`\):([\s\S]*?)\. CI also runs/);
  assert.ok(inventory, 'README host-proof inventory sentence is missing or malformed');
  const listed = [...inventory[2].matchAll(/`([^`]+)`/g)].map(([, name]) => name);
  assert.ok(listed.length, 'README host-proof inventory is empty');
  assert.ok(listed.every((name) => name === 'prove' || /^[a-z0-9-]+-prove$/.test(name)), 'README host inventory contains a non-proof name');

  const commands = testScript.split(' && ');
  assert.ok(commands.length && commands.every((command) => {
    const match = command.match(/^node(?: --import \.\/register\.mjs)? ([a-z0-9-]+\.mjs)$/);
    return match && (match[1] === 'prove.mjs' || /^[a-z0-9-]+-prove\.mjs$/.test(match[1]));
  }), 'server scripts.test contains an unsupported command or proof target');
  const expected = commands.map((command) => command.match(/ ([a-z0-9-]+\.mjs)$/)[1].replace(/\.mjs$/, ''));
  assert.equal(Number(inventory[1]), expected.length, 'README host-proof count does not match server scripts.test');
  assert.deepEqual(listed, expected, 'README host-proof order does not match server scripts.test');
  for (const name of expected) assert.ok(hasFile(`${name}.mjs`), `server proof file is missing: ${name}.mjs`);
  return expected.length;
}

const fixtureReadme = '`npm test` runs the 2 host proofs in the sequence in `server/package.json` (`scripts.test`): `alpha-prove`, `beta-prove`. CI also runs `client-prove`.';
const fixtureCommand = 'node --import ./register.mjs alpha-prove.mjs && node beta-prove.mjs';
const fixtureFiles = new Set(['alpha-prove.mjs', 'beta-prove.mjs']);
const fixture = (readme, command) => check(readme, command, (name) => fixtureFiles.has(name));
assert.equal(fixture(fixtureReadme, fixtureCommand), 2);
const expectInvalid = (readme, command) => assert.throws(() => fixture(readme, command));
expectInvalid(fixtureReadme.replace('`alpha-prove`, ', ''), fixtureCommand); // omitted name
expectInvalid(fixtureReadme.replace('`beta-prove`', '`beta-prove`, `gamma-prove`'), fixtureCommand); // extra name
expectInvalid(fixtureReadme.replace('`alpha-prove`, `beta-prove`', '`beta-prove`, `alpha-prove`'), fixtureCommand); // reversed
expectInvalid(fixtureReadme.replace('runs the 2 host', 'runs the 3 host'), fixtureCommand); // stale count
expectInvalid('No host inventory here.', fixtureCommand); // missing sentence
expectInvalid(fixtureReadme, `${fixtureCommand} && node gamma-prove.mjs`); // added invocation

const readme = readFileSync(join(root, 'README.md'), 'utf8');
const testScript = JSON.parse(readFileSync(join(root, 'server', 'package.json'), 'utf8')).scripts.test;
const count = check(readme, testScript);
console.log(`README host-test inventory matches server scripts.test (${count} proofs); six invalid fixtures rejected.`);
