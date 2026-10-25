# Main integration evidence

Main source: `b90290ab`.
Runtime: Node 22.23.4.

The normal merge preserves current main and the approved lobby layout.
Both table and LobbyView entries remain in the size ceiling and seven fixture files.
The connection-health indicator remains in the lobby, within the existing Wayfarer row.
All connection-health assertions pass without edits.

The initial loosen.log inspected committed HEAD before the merge commit existed.
Its stale-head flags are diagnostic only; final committed-head output follows separately.
The existing geometry-replacement approval and detector remain unchanged.


The final serial regression pass tests merge source `3f7d967e`.
Types, build, registered146, size-delta, growth, layout, lobby, overflow, chat, title-chunks,
chunk-fail, tabs, served tabs and watcher checks pass.
The focused connection-health proof also passes unchanged.
Final loosen output contains exactly the two approved chat geometry flags.
The integration introduces no other assertion replacements.

Screenshots and measured geometry are in `screenshots/`.
The layout proof redirects only its artifact destination to preserve earlier captures.
All original layout assertions remain unchanged.

The full merge whitespace check reports whitespace in imported main proof logs.
The source and script diff against current main passes its whitespace check.
Imported evidence remains unchanged.
