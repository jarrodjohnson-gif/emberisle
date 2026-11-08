# Desktop long-name results (#1406)

Runtime source: e5d9b5dfb1cdf1f75a3b88c9ed52bb7c13b85b60.
Canonical base: b30170a21d57799191fe85c2ee377284c29abdc8.
Claim: https://github.com/jarrodjohnson-gif/emberisle/issues/1406#issuecomment-6718014718

Before: unchanged base runtime fails the additive production proof at1280x720.
The table needs670 px inside a622 px wrapper; Total lies outside its visible width.
The original failure, measured cell bounds and normal UI picture remain under before/ and baseline-failed.log.

After: one card-width class chooses768 px for mouse desktop; the existing touch/narrow width stays672 px.
The same proof passes1280x720,1024x768 and844x390, with four complete long names and all seven columns.
Wrappers measure718/718,718/718 and734/734 client/scroll widths respectively.
Every cell fits the wrapper and viewport; every displayed total matches the game fixture.
The proof uses actual production WinScreen and hashed assets, with no CSS override or shortened name.
This is a finished-state layout fixture; it does not claim a new authoritative winning-action test.
The existing win-action proof exercises those real hosted actions separately.
I inspected the1280x720 after picture; Hidden and Total are visibly present.

Node22.23.4, Playwright1.63.0 and default Chromium1243; no executable override.
Types, production build, registration200, loosen and size ceilings/growth pass.
Measured growth: sheets+9/200 B, index+2/400 B, IslandCanvas-4 B.
No budget or existing assertion changed. The new proof is registered beside win-action in package.json and CI presentation-2.
Full source/picture hashes are in manifest.json.
The production layout runs preceded their commit; the manifest identifies their exact tested bytes.
Frozen existing win-action and win-list regressions are still running at this checkpoint.
