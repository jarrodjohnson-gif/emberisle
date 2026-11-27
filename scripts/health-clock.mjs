// Freeze the browser wall clock before sending its pause target across the Node/browser boundary.
// After pausing timers, restore Date advancement so health elapsed-time assertions keep their original meaning.
export async function pauseHealthClock(page) {
  const clockStart = new Date();
  await page.clock.setFixedTime(clockStart);
  await page.clock.pauseAt(clockStart);
  await page.clock.setSystemTime(clockStart);
}
