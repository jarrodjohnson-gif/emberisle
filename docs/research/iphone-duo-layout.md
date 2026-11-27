# iPhone Duo layout (#1829)

- gate worked: research, with measured options
- date: 2026-11-21
- agent: claude-sonnet-a (Claude Sonnet 5.5)

## What I read

All pages read on 2026-11-21. Apple's developer pages are scripts, so I read their JSON content feed
(`developer.apple.com/tutorials/data/...`), which holds the same text as the page.

- [Apple Newsroom, "Apple unveils iPhone Duo"](https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/), 2026-09-09.
- [iPhone Duo tech specs](https://www.apple.com/iphone-duo/specs/).
- [HIG, Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo), new page 2026-09-09.
- [Preparing your app for iPhone Duo](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo) (native apps).
- [Get ready for iPhone Duo](https://developer.apple.com/iphone-duo/) (the hub page: videos, docs, Xcode 27.1).
- [WebKit blog, WebKit Features for Safari 27.1](https://webkit.org/blog/18486/webkit-features-for-safari-27-1/), 2026-10-23. The only web source.
- [Wikipedia, "iPhone Duo"](https://en.wikipedia.org/wiki/Foldable_iPhone), for the release date only (secondary source).
- HIG [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Status bars](https://developer.apple.com/design/human-interface-guidelines/status-bars) and [Going full screen](https://developer.apple.com/design/human-interface-guidelines/going-full-screen).

## What is true

Apple does publish for the iPhone Duo. It shipped on 2026-10-23 (Wikipedia, "iPhone Duo": announced 2026-09-09).

**Displays** (specs page)
- Outer: 5.4 in, 1398 x 2034 px, 460 ppi. Inner: 7.6 in, 1878 x 2670 px, 430 ppi.
- Dynamic Island and Always-On on both screens. The inner front camera is under the display.
- The newsroom says both displays share one aspect ratio, so content scales between them.
- Apple prints pixels, not points. 1398 / 3 x 2034 / 3 is 466 x 678, and 1878 / 3 x 2670 / 3 is 626 x 890. That assumes a 3x scale, which Apple does not state. These are the #1814 sizes.

**What Safari gives a web page** (WebKit blog, CSS px)

| Pose | Width | Small height (svh) | Large height (lvh) |
|---|---|---|---|
| Outer, portrait | 382 | 580 | 618 |
| Outer, landscape | 594 | 368 | 406 |
| Inner, portrait, one tab | 669 | 867 | 902 |
| Inner, landscape, one tab | 951 | 585 | 620 |
| Inner, two windows side by side, each | 385 | 571 | 609 |

- The folded portrait viewport is 382 x 580 to 382 x 618, not 466 x 678. The #1814 sizes are the full screen, not what Safari leaves a page.
- "Web content does not currently extend to fill the space behind these controls." Safari paints the page's background color there. Apple says it is researching ways to let sites use that space.
- Web apps: "work on iPhone Duo just like they do everywhere else."
- The Viewport Segments API adds six `env()` variables (`viewport-segment-width`, `-height`, `-top`, `-right`, `-bottom`, `-left`, each indexed by column and row).
- The Device Posture API (`device-posture` media query, `navigator.devicePosture`: `folded` or `continuous`) is a developer preview behind a feature flag.
- The post does not mention the status bar, the Dynamic Island or `safe-area-inset-*`.

**HIG, Designing for iPhone Duo** (native apps; the web rules follow Safari, above)
- The system moves toolbars, tab bars and navigation to the side on the outer display and on the inner display in landscape. It keeps horizontal bars on the inner display in portrait. Apple lists the status bar and the Dynamic Island among the controls on the side.
- "Make your game playable in every device pose... fill the screen as the device pose changes. When resizing, keep text and control sizes as consistent as possible. Prefer changing the aspect ratio over letterboxing or pillarboxing in games."
- "Consider using the full display width for interfaces where bars aren't necessary... as long as nothing conflicts with the Dynamic Island or the status bar."
- "In general, don't override the default bar placement."
- Reserved regions: the outer camera (always, and it grows into the Dynamic Island), the inner camera (only when active), and the folding region (only when partly open, and it splits the inner display).
- Avoid extreme layout changes as people fold. Use size classes, layout margins and safe-area insets, not fixed widths.

**HIG, other pages**
- [Status bars](https://developer.apple.com/design/human-interface-guidelines/status-bars): "Avoid permanently hiding the status bar." Hide it for full-screen media if people can bring it back with a simple gesture. No Duo text.
- [Going full screen](https://developer.apple.com/design/human-interface-guidelines/going-full-screen) (updated 2025-06-09): the home indicator hides on its own and returns on a bottom touch. Keep that behavior.
- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) has no Duo text. Its device table was updated 2026-09-09 with no Duo row.

## What I am not sure about

- Whether the full-screen 466 x 678 ever reaches a web page. The WebKit table says Safari gives 382 x 580 to 382 x 618. A home-screen web app may get more. Apple's pages do not say. A real device or the Xcode 27.1 simulator settles it.
- The 3x scale behind 466 x 678.
- What "hide the status bar" can mean for a web page. A web page cannot hide the status bar or move it. Apple's guidance for hiding bars is for native apps. For a web page the only levers are in-page layout, a home-screen web app, and the Viewport Segments and Device Posture APIs.
- Whether Safari's side controls take width in the folded landscape pose. The table gives 594 x 368, which is not the 678 x 466 estimate either.

Apple's rules do not forbid any of the options below. They are all in-page layout.

## Layout options

Today at 466 x 678 the island's hole is 56.3 % of the height: 68 px above, 228 px below. Law 3 wants 60 %.
The proof is `npm run duo-layout-options-prove`. It injects each option as CSS into the real game and re-sets the hole, so the board refits as a build would. It changes nothing in `src/`.
Pictures are 466 x 678 at deviceScaleFactor 2, in `docs/design/duo-layout-options/pictures/`. Every number is in `measurements.json` there.

Island height share is the hole's share of the height, the #1814 measure. Hex span is how big the island really is on screen, from the 19 hex centres. The island is width-bound, so the span moves less than the hole does.

| Option | What changes | 466x678 height share | 382x580 | 382x618 | Hex span, 466x678 (width x height) |
|---|---|---|---|---|---|
| Today | nothing | 0.563 | 0.490 | 0.521 | 0.645 x 0.294 |
| A. Slim goods row | goods cards 44 px (symbol and count, no name), tray padding tighter | 0.619 | 0.555 | 0.583 | 0.710 x 0.324 |
| B. Instruction on the button | the turn line and last event leave the tray; the words go on the primary button | 0.625 | 0.562 | 0.589 | 0.717 x 0.327 |
| C. Both | A and B, and the seat bar 8 px higher | 0.690 | 0.638 | 0.660 | 0.724 x 0.330 |
| D. Side rail (not proposed) | goods and buttons in a 112 px right rail | 0.882 | 0.862 | 0.871 | 0.528 x 0.241 |

- Roll phase and main phase give the same numbers in every row.
- A, B and C reach 0.60 at 466 x 678. Nothing is cut off, covered or under 44 px, and nothing scrolls sideways.
- Only C reaches 0.60 at the Safari viewports Apple publishes (382 x 580 and 382 x 618). A and B do not.
- D is data only: the proof never gates it. It passes the number but fails the aim: the island gets smaller than today (0.528 wide against 0.645). It is the HIG's side-bar idea, tried and rejected on the numbers.
- B hides the instruction in the mock. The words ("Roll the dice", "Your turn") must go somewhere. That is a copy and design call.
- C's seat bar sits 8 px higher. The page area starts below Safari's own controls (WebKit blog above), so the top padding should not reach the Dynamic Island. Check on a device.
- None of these use the Viewport Segments or Device Posture APIs. A partly folded pose is not measured.

## Prove output

```
npm run duo-layout-options-prove
failures: 0, page errors: 0
duo-layout-options-prove: ok
```

## Handoff

```
done: research note; three measured options (A, B, C) and one rejected (D); pictures at 466x678 @2x; proof registered in package.json and ci.yml.
left: the owner picks an option (Question on #1829). No layout change is built.
broke: nothing.
next agent: build the option Jarrod picks. Then re-measure with npm run duo-viewport-prove --save. Check the real Safari viewport (382 x 580..618) on a device or the simulator first.
```
