# Lossless raw evidence archive

GPT-6.1 Sol; parent: Codex-p. Desk request: PR 883 comment 6424597548.

`raw-evidence-through-0331546.tar.gz` stores 138 verbose raw files and superseded captures.
Its member names are relative repository paths, beginning with `docs/proofs/831-refresh/`.
Existing gzip payloads remain byte-identical gzip files inside the tar archive.
No log contents, failures, timestamps, authors or historical measurements were rewritten.

[original-paths.json](original-paths.json) records all 164 original files before archival.
Each entry records its original path, byte count, SHA-256 and current storage.
The 26 directly visible files include every current README, both existing assertion tables and all nine owner PNGs.
Existing SHA-256 manifests remain visible. The new rename table remains directly visible too.

Archive SHA-256: `6b41f29379d11b2dfd82ced2d00f617e43a8a781c75a272ee9eeb641ccc5e2ee`.
Before removing raw originals, the archive passed member-byte verification and independent temporary-directory extraction.
Every extracted file matched its original bytes and SHA-256. Every directly visible file also matched its original bytes.

## Extract and verify

Run from the repository root. Extract into a temporary directory to inspect original relative paths safely.

```bash
(cd docs/proofs/831-refresh/archive && sha256sum -c SHA256SUMS)
proof_extract=$(mktemp -d /tmp/831-proof.XXXXXX)
tar -xzf docs/proofs/831-refresh/archive/raw-evidence-through-0331546.tar.gz -C "$proof_extract"
python - "$proof_extract" <<'PY'
import hashlib, json, pathlib, sys
extracted = pathlib.Path(sys.argv[1])
manifest = json.loads(pathlib.Path('docs/proofs/831-refresh/archive/original-paths.json').read_text())
for name, record in manifest['paths'].items():
    path = extracted / name if record['storage'] == 'archive' else pathlib.Path(name)
    data = path.read_bytes()
    assert len(data) == record['bytes'], name
    assert hashlib.sha256(data).hexdigest() == record['sha256'], name
print('PASS: all 164 original paths match their recorded bytes and SHA-256')
PY
```

Historical README links use their original relative paths. Find any moved target in `original-paths.json`.
For example, frozen client output extracts to:
`$proof_extract/docs/proofs/831-refresh/codex-p-2026-10-26-option-b/frozen/client.log.gz`.
Use `gzip -cd` to read an extracted `.gz` log.

To restore links beside the unchanged READMEs, extract from the repository root with `tar --keep-old-files -xzf`.
Only archived paths are members; visible READMEs and owner pictures are absent from the archive.
Temporary extraction is sufficient for verification and does not modify the checkout.

## Retained failure paths

| Record | Original path inside archive |
| --- | --- |
| Intentional B-proof failure against old A; route tabs remain | `docs/proofs/831-refresh/codex-p-2026-10-26-option-b/b-fail-first.log.gz` |
| First source B runtime failure; `__emberisle` undefined; correlation unproved | `docs/proofs/831-refresh/codex-p-2026-10-26-option-b/b-runtime-trade-tabs.log.gz` |
| Frozen client host-down restore failure after IslandCanvas import failure | `docs/proofs/831-refresh/codex-p-2026-10-26-option-b/frozen/client.log.gz` |
| Passive candidate PASS; no cause established | `docs/proofs/831-refresh/codex-p-2026-10-26-option-b/diagnostics/p883-candidate-client-diagnostic.log.gz` |
| Passive main PASS; no cause established | `docs/proofs/831-refresh/codex-p-2026-10-26-option-b/diagnostics/p883-main-client-control.log.gz` |

No browser proof ran during archival. Parent owns subsequent frozen validation.
The forthcoming `codex-p-focus-negative/` folder is excluded from this archive.
