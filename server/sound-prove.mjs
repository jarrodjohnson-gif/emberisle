import { cue } from "./cue.mjs";

const click = cue("ui_click");
if (!click || click.length < 100) {
  console.log("FAIL click", click && click.length);
  process.exit(1);
}
let missing = null;
try {
  missing = cue("amb_wind");
} catch (err) {
  console.log("FAIL throw", err);
  process.exit(1);
}
if (missing !== null) {
  console.log("FAIL missing should be null");
  process.exit(1);
}
console.log("ui_click", click.length, "bytes; amb_wind missing and did not throw");
