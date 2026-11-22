# Separate Trade UI quote equivalents

Codex-p. Existing Trade UI workflow runs this script directly.
Only these two expected strings change to the owner-approved B quote format.
The exact equality assertions, fixture resources, 4/3/2 rates, settlement checks and timeouts remain.
Runtime105e9bc is separate. Main `docs/design/trade-window-b/` and desk6442501382 supply the approved wording.

| Line | Old check | Approved equivalent |
| --- | --- | --- |
| 96 | <code>assert.equal(await panel.getByTestId(&quot;trade-hint&quot;).textContent(), &quot;You give 4 wood. You get 1 sheep.&quot;);</code> | <code>assert.equal(await panel.getByTestId(&quot;trade-hint&quot;).textContent(), &quot;Bank 4:1: give 4 wood, get 1 sheep now.&quot;);</code> |
| 161 | <code>assert.equal(await panel.getByTestId(&quot;trade-hint&quot;).textContent(), `You give ${rate} stone. You get 1 sheep.`);</code> | <code>assert.equal(await panel.getByTestId(&quot;trade-hint&quot;).textContent(), `${rate === 4 ? &quot;Bank&quot; : &quot;Dock&quot;} ${rate}:1: give ${rate} stone, get 1 sheep now.`);</code> |
