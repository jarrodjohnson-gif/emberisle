const KEY = "emberisle-practice-win";
let won = false;
export function hasPracticeWin() {
  try { return won || localStorage.getItem(KEY) === "1"; } catch { return won; }
}
export function recordPracticeWin() {
  won = true;
  try { localStorage.setItem(KEY, "1"); } catch { /* Keep progress for this visit when storage is blocked. */ }
}
