# Current-main lobby chat reproduction

Baseline: `00ba9a505d0ab9794cef0ef29ddeba050b5c4a6a`.

At 1280×720, host a table and add three bots. The sticky footer initially covers the chat composer and Send control. Their centers fail hit-testing. Scroll `.lobby-cover` down 74 pixels. The composer moves from y=528 to y=454, and its center passes hit-testing.

Evidence: `1280x720-mouse-lobby-before.png`, `1280x720-mouse-lobby-after.png`, and `results.json`. The view remains reachable after scrolling. This finding makes no permanent-inaccessibility claim. The screen emitted no page errors.
