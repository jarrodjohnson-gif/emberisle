// The centre-screen turn moment, and the roll-driven "My numbers" strip (#643), one chunk (see chunks.ts).
// useStage places a moment clear of the HUD; the "Your turn" banner (its own chunk) takes it from here, so the code is not in both.
export { useStage } from "@/components/game/stage";
export { TurnMoment } from "@/components/game/TurnMoment";
export { MyNumbers } from "@/components/game/MyNumbers";
export { FirstGameCoach } from "@/components/game/FirstGameCoach";
export { SetupPipHints } from "@/components/game/SetupPipHints";
