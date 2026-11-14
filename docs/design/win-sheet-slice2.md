# Design Specification: Win Screen Bottom Sheet (Slice 2, #1590)

## Overview

This specification delivers slice 2 of the end-of-game redesign for Issue #1590.
It replaces the centered modal card with a unified bottom sheet in tray style.
The island remains in full view above the sheet without background dimming.
A single score list replaces the legacy desktop table across all viewports.

## Owner Decisions

Owner answers on 2026-11-12 establish key architectural boundaries:
- `q1563-results-desktop` (Option A): one simple list across all screens; legacy desktop table removed.
- `q1563-play-again` (Option A): "Play again" in practice immediately deals a new game.
- Bots retain their seats on practice rematch and display no waiting state.

## Layout and Geometry

### 1. Desktop Width Constraint

On desktop viewports, the sheet matches the tray's width constraint.
Maximum width is constrained to 720 px (`max-w-[720px] mx-auto`).
This maintains consistent alignment with the in-game action tray.
On mobile, the sheet spans full viewport width with standard insets.

### 2. Headline and Subtitle

The headline features the winner's colour dot and concise victory text:
- Displays "You win" when the local player wins.
- Displays "{Name} wins" when another seat wins.
- Typeset at 34 px bold ink text.
A single quiet line underneath states the winning condition (e.g., "Built an outpost.").
Total score is not repeated in the headline.

### 3. Player Score Rows

Scores display in a clean, vertical list sorted by rank:
- Winner always appears in the first row.
- Each row maintains a strict 44 px touch target.
- Row contains player colour dot, display name, and 26 px bold points.
- Tapping any row toggles its expanded breakdown inline.
- Chevron indicators clearly communicate row expandability.

### 4. Closed State and Tray Banner

A 44 px Close button folds the sheet into the tray's win line.
The collapsed tray displays the outcome and a single "Scores" button.
This permanently retires "Hide scores", "Show scores", and floating chips.
Keyboard users dismiss the sheet via Escape, focusing the "Scores" button.

## Action Buttons by Game Mode

Each game mode provides tailored, minimal action controls.

### 1. Practice and Hotseat

- Primary action: "Play again" deals a new match with identical bots.
- Secondary action: "Menu" returns to title and lobby.

### 2. Online Host

- Primary action: "Play again".
- Secondary action: "Menu".
- Target line: "Next game" target code sits as a quiet row above buttons.

### 3. Online Guest

- Primary action: "I'll play again".
- Secondary action: "Menu".
- Waiting line: "Waiting for {Host} to start another." displays under list.

### 4. Watcher and Spectator

- Single action: quiet "Menu" button only.
- No rematch buttons appear for non-participants.

## Rematch Indicators

Online rooms show explicit participant readiness:
- Human players who tap rematch show a tick icon and "plays again" text.
- Readiness is never communicated through colour alone.
- AI bots display no rematch indicators or waiting status.

## Integrated Features

Related end-of-game features retain their designed placements:
- Island Awards (#1452): displays inside the winner's expanded row.
- Dice Story (#1453): horizontal summary strip renders directly under the player list.
- Reactive emotes: quiet tray reaction button remains accessible online.

## Bundle Budget and Verification Plan

### 1. Size Constraints

The `sheets` chunk currently has approximately 340 bytes of headroom.
Removing the legacy desktop table and hero point display pays for the sheet.
No size ceiling or allowance increases are permitted.

### 2. Completion Proof Strategy

Verification requires real-game browser proofs across three primary viewports:
- 390x844 (portrait phone)
- 844x390 (landscape phone)
- 1280x720 (desktop baseline)
The proof confirms 44 px touch targets, 12 px text floors, and uncluttered scene framing.
