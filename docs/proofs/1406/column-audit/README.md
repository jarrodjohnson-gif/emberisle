# Award-column audit: decision required

Authority: corrected owner direction in PR1446 comment6744006688. Claim6743703394, expansion6746299543.
The owner means Longest path and Largest army widths. This supersedes earlier spacing-first direction.
No new runtime layout is approved or published here. This branch differs from PR headbc2fa367 only in evidence.

Controlled browser measurements retain672px, original main8px desktop cell padding, existing4px short-screen padding, and original names/fonts.
Two award columns were constrained to content minima and then64px with two-line headings.
The actual CI font identity was not logged. DejaVu reproduces exact previous CI645.484px at4px padding.
With original8px padding, it needs701.484px inside622px.

| Viewport/font | Main8 table/wrapper | Award64 table/wrapper | Remaining overflow |
|---|---|---|---|
|1280x720 and1024x768, application default|670.20/622|667.50/622|45.50px|
|1280x720 and1024x768, DejaVu control|701.48/622|691.09/622|69.09px|
|844x390, both fonts|638/638|638/638|0px|

Content-minimum widths cannot reduce tall-screen tables further without heading overflow.
At844x390 they narrow award columns substantially and redistribute the free width, while the table already fits.
The owner-directed column-only option therefore cannot satisfy full-name geometry at all required sizes.

Measured proposal A, not implemented:58px award columns on tall desktops,64px on short screens;2px tall desktop cell padding.
Keep default/short4px padding,672px card, full names, heading11px, body14px/short12px.
Both fonts fit622/622 at1280 and1024,638/638 at844. Headings remain two lines.
Recommendation A needs the owner's decision because column-only measures still overflow.
Alternative: the owner supplies an approved name-ellipsis arrangement; no such arrangement is implemented.
Proposal screenshots and JSON are controlled browser measurements, not production acceptance or a full passing proof.

Superseded local commita469d5bb has padding-only source plus additive font proof, never pushed to PR1446.
Its six long-name cases PASS and static checks PASS, but corrected owner direction supersedes that implementation.
An action run lost its process during environment unavailability; no completion was claimed.
One resumed action run was deliberately stopped after the corrected direction arrived; partial logs are retained.
No cancelled run is called a test pass or causal fix. No assertions, budgets or deadlines were loosened.
Existing bc2fa367 local list timeout/main passing control remain in owner-d evidence.
