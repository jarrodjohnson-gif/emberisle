# Approved B quote equivalents

Codex-p; helper: GPT-6 Luna. No assertion was removed.

Owner-approved B is stored in main `docs/design/trade-window-b/`; desk review6442501382 requires matching its live quote.
The runtime change is a separate commit. These nine expectations preserve their original fixture goods, rates and stock values.
All other proof lines remain byte-identical and in order. No timeout, tolerance or loop changed.
Both exact accessible-description expectations still require live Bank stock.

| Old line | Old check | Approved equivalent |
| --- | --- | --- |
| 350 | <code>await hint(page, &quot;You give 4 stone. You get 1 wheat.&quot;);</code> | <code>await hint(page, &quot;Bank 4:1: give 4 stone, get 1 wheat now.&quot;);</code> |
| 478 | <code>await describedAs(bankFor(page), `You give 4 wood. You get 1 stone. Bank stock: ${base.bank.ore} stone.`, `${tag} exact Bank receipt and live stock`);</code> | <code>await describedAs(bankFor(page), `Bank 4:1: give 4 wood, get 1 stone now. Bank stock: ${base.bank.ore} stone.`, `${tag} exact Bank receipt and live stock`);</code> |
| 514 | <code>await hint(page, &quot;You give 2 wood. You get 1 stone.&quot;);</code> | <code>await hint(page, &quot;Dock 2:1: give 2 wood, get 1 stone now.&quot;);</code> |
| 515 | <code>await describedAs(bankFor(page), `You give 2 wood. You get 1 stone. Bank stock: ${base.bank.ore} stone.`, `${tag} live dock and stock description`);</code> | <code>await describedAs(bankFor(page), `Dock 2:1: give 2 wood, get 1 stone now. Bank stock: ${base.bank.ore} stone.`, `${tag} live dock and stock description`);</code> |
| 529 | <code>await hint(page, `You give ${rate} wood. You get 1 stone.`);</code> | <code>await hint(page, `${rate === 4 ? &quot;Bank&quot; : &quot;Dock&quot;} ${rate}:1: give ${rate} wood, get 1 stone now.`);</code> |
| 545 | <code>await hint(page, &quot;You give 4 wood. You get 1 stone.&quot;);</code> | <code>await hint(page, &quot;Bank 4:1: give 4 wood, get 1 stone now.&quot;);</code> |
| 558 | <code>await hint(page, `You give ${rate} wood. You get 1 stone.`);</code> | <code>await hint(page, `${rate === 4 ? &quot;Bank&quot; : &quot;Dock&quot;} ${rate}:1: give ${rate} wood, get 1 stone now.`);</code> |
| 596 | <code>await hint(page, &quot;You give 4 wood. You get 1 stone.&quot;);</code> | <code>await hint(page, &quot;Bank 4:1: give 4 wood, get 1 stone now.&quot;);</code> |
| 646 | <code>await hint(page, &quot;You give 4 wood. You get 1 stone.&quot;);</code> | <code>await hint(page, &quot;Bank 4:1: give 4 wood, get 1 stone now.&quot;);</code> |

The same visible-text wait and exact description helper enforce each replacement. No proof run is claimed by this table.
