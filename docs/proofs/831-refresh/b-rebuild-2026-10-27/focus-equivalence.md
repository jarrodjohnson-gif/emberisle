# Approved B keyboard-order equivalent

Codex-p. Runtime616659d moves Bank before Table, matching the approved B mock.
At af35573, the unchanged old sequence failed when it expected Ask but Bank received focus.
Only these two expected entries exchange positions. Every target, Tab press and focus assertion remains.
The shared sequence still skips disabled controls and wraps through Close within the modal.
No positive tabindex, runtime focus handler, timeout or accessibility assertion changed.

| Old expected sequence | Approved equivalent |
| --- | --- |
| <code>["Ask", askFor(page)],<br>["Bank", bankFor(page)],</code> | <code>["Bank", bankFor(page)],<br>["Ask", askFor(page)],</code> |

Source: main `docs/design/trade-window-b/`, Bank before Table in portrait and left of Table in landscape.
Desk review6442501382 requires matching B. This table records the expected action-order replacement only.
The initial af35573 failure is retained in the validation record.
