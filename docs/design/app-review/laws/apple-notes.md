# Apple design pages: notes for Emberisle (touch-first browser game)

Purpose: plain-English notes for a team building a mobile-first browser game. These are reference notes, not Apple rules we must follow for a web game.

## Read status

| # | Page | Status |
|---|------|--------|
| 1 | developer.apple.com/design/human-interface-guidelines | NOT READ. WebFetch returned only the title (empty JavaScript shell). Points below are from WebSearch snippets, marked "from search". |
| 2 | .../designing-for-macos | NOT READ. WebFetch returned only the title. Points below are from WebSearch snippets, marked "from search". |
| 3 | developer.apple.com/design/tips/ ("UI Design Dos and Don'ts") | READ DIRECTLY. Full content. |
| 4 | developer.apple.com/design/resources/ | READ DIRECTLY. Full content. |

## Points from the "UI Design Dos and Don'ts" page (read directly)

The page gives 10 short tips, each linking to the HIG. It names four groups (Interactivity, Readability, Graphics, Clarity) but does not say which tip belongs to which group.

1. **Hit targets: 44 x 44 points minimum.** The page says controls should be at least 44 x 44 pt so a finger can tap them accurately. This is the only sizing number the page gives for tapping. Use the same number as a starting point for touch controls in Emberisle, in CSS pixels as a rough equivalent, and check it on a real phone.
2. **Text size: at least 11 pt.** The page says text should be at least 11 pt to be readable without zooming. This is a floor, not a recommended body size.
3. **Fit the layout to the screen.** Users should see the main content without zooming or scrolling sideways. This applies directly to the phone layout: no horizontal scroll.
4. **Use touch-native controls.** Choose controls that suit gestures so interaction feels natural. For a game, that means large, obvious buttons and drag or tap gestures that do what the picture suggests.
5. **Contrast and spacing.** Keep strong contrast between text and background. Do not let text overlap; add line height or letter spacing if needed.
6. **Keep controls near what they change, and align things.** Put a control close to the content it affects. Align text, images and buttons so the grouping shows which things belong together. This helps with a crowded board or HUD.
7. **Images at intended aspect ratio, and high-resolution assets.** Do not distort images. Provide high-resolution versions for dense screens. (Apple wording is @2x and @3x; the principle carries to sharp rendering on high-DPI screens.)

Page limits: it gives only two numbers (44 pt and 11 pt). It says nothing on safe areas, motion timing, or optional content.

## Points from the macOS page (from search, not read directly)

- Windows present views and controls for an app. A **panel** floats above its window to hold supplementary controls or information tied to the active window. This is the closest Apple pattern to a "secondary content" area that does not crowd the main view. (from search)
- Split views: each pane can have its own layout, and pane heights should stay consistent so content lines up. (from search, WWDC25 session summary)
- Layout guidance says a consistent layout that adapts to different sizes, orientations and multitasking helps people. (from search, the general Layout page snippet)
- The search returned no macOS pixel sizes or margin numbers. Do not treat any numbers as sourced.

## Points from the main HIG page (from search, not read directly)

- The search snippets confirm the 44 x 44 pt hit-target guidance for controls. One developer-forum post quotes the HIG as saying a button should have a hit region of at least 44 x 44 pt. The forum thread also says the HIG are guidelines, not strict requirements. (from search)
- Accessibility: Apple's "Inclusion" guidance says apps should present content and functions so everyone can access and understand them. No sizing numbers came back for this. (from search)
- Gestures: a separate HIG page covers gestures. Its content was not read. (from search, page title only)
- No search result covered safe-area insets (notch, rounded corners, home indicator). For a phone layout, this still needs checking separately in CSS (`env(safe-area-inset-*)`) and on real devices. That is a web standard, not something these pages cover.

## Five to eight practical points for a touch game (combined, with sources)

1. **44 x 44 pt minimum tap target** for every tappable control. Source: Dos and Don'ts page (read directly).
2. **No horizontal scrolling; fit primary content to the screen.** Source: Dos and Don'ts page (read directly).
3. **Keep text at 11 pt or larger** and keep contrast high. Source: Dos and Don'ts page (read directly).
4. **Put controls next to what they affect**, and align related items so grouping is clear. Source: Dos and Don'ts page (read directly).
5. **Use a floating panel or a secondary pane for optional content**, such as a mini-games area, so the main board stays uncluttered. Source: macOS page via search (panels), not read directly.
6. **Keep layouts consistent across sizes and orientations.** Source: Layout page via search, not read directly.
7. **Make controls easy to hit with a finger, and do not rely on the visible shape alone.** The tap area can be larger than the drawn icon. Source: forum thread quoting HIG via search, not read directly. Treat as guidance only.
8. **Accessibility: present content so everyone can access it.** Source: Inclusion page via search, not read directly.

## What the UI kits and templates would and would not help with

Source: Resources page (read directly).

**What the page says:**
- **UI Kit for iOS and iPadOS 27.** Available as a Figma Community file and a Sketch share file. The page gives no description of contents and no statement of purpose beyond the name.
- **App Icon Template for iOS and iPadOS 27.** Available as a Figma Community file and a Sketch share file. A single DMG download covers Photoshop and Illustrator templates. The Figma file slug mentions watchOS 27 as well, but the page lists it under iOS and iPadOS. The page does not describe what the template contains.
- The version is written as **27** for both iOS and iPadOS. The page does not say more.

**What they would help with:**
- Mocking up native iOS and iPadOS screens: system-style buttons, lists, sheets, and tab bars in Figma or Sketch. Only if we are making a native app.
- Making an app icon at the right sizes and shapes for iOS, if we ship an iOS app.
- Learning Apple's spacing and component conventions as a reference point.

**What they would not help with:**
- **They are for native iOS and iPadOS components.** Emberisle is a browser game. The kits do not render in a browser, and their components are not HTML/CSS.
- **They do not cover our art.** The 3D island is rendered in the browser. A UI kit does not help with terrain, lighting, models or the in-game look.
- **They do not match our look.** Emberisle has its own style. Copying iOS chrome would make the game look like an iOS app in a browser.
- **The version is tied to iOS 27.** Mocks built from the kit will show iOS 27 chrome, which will age as the OS changes.
- **Figma does not produce HTML.** A Figma mock is a picture or a spec. Someone still has to build the HTML and CSS. Figma helps with layout review and spacing, not with the game engine.
- **Blender** works with 3D models for the island. It does not use the UI kits and does not connect to the Apple pages. It is separate from the UI work.
- **Icons and app-icon templates only matter** if we package the game as an iOS app or add a home-screen icon. For a browser game, the favicon and a web app manifest icon are the relevant items, and they follow web standards.

**Bottom line for the team:** use the Dos and Don'ts page for sizing and clarity rules (44 pt, 11 pt, no sideways scroll). Treat the UI kits as optional reference material for a native iOS app, not as a base for the browser game's look or its HTML mocks. If we want Figma mocks of Emberisle screens, build our own file with our own components, and use the 44 pt rule as a constraint.

## Limits of this review

- Two of four pages (main HIG and macOS) were not read. Their points come from search snippets and are labelled as such.
- The Dos and Don'ts page is brief and gives only two numbers.
- No safe-area numbers were found. Check safe areas on real devices.
