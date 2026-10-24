"""Retain every original proof byte except the three declared strengthening hunks."""
from pathlib import Path
import subprocess
p = 'scripts/hotseat-prove.mjs'
before = subprocess.check_output(['git', 'show', 'f334d47:' + p], text=True)
after = Path(p).read_text()
changes = [
 ('    window.__pendingPumps = 0;\n', ''),
 ('          // Keep an in-flight callback counted through any synchronous re-arm.\n          try { return callback.apply(this, firedArgs); }\n          finally { window.__pendingPumps--; }', '          return callback.apply(this, firedArgs);'),
 ('      window.__pendingPumps++;\n      try { return later.call(this, pump.fire, ms, ...args); }\n      catch (failure) { window.__pendingPumps--; throw failure; }', '      return later.call(this, pump.fire, ms, ...args);'),
 ('return window.__pendingPumps === 0 && now - window.__quietAt >= quietMs;', 'return now - window.__quietAt >= quietMs;'),
]
for added, original in changes:
    assert after.count(added) == 1, added
    after = after.replace(added, original)
assert after == before, 'an undeclared original line changed'
print('PASS: only pending accounting and the stricter return guard differ; original count tracking, quiet term, 400/4000 invocation, Leave assertion/message, first-play wait, slice and every other byte retained.')
print(subprocess.check_output(['git', 'diff', 'f334d47', '--', p], text=True))
