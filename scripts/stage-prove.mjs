// Real useStage hook in a React/DOM fixture matching #1096's observed phone geometry.
// Sample the first RAF after shell refits; no timer or retry can hide stale placement.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const PORT = Number(process.env.VITE_PORT) || 8490;
const probe = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useStage } from '/src/components/game/stage.ts';
const h = React.createElement;
function App() {
  const [dep, update] = useState(0);
  window.rerender = () => flushSync(() => update(n => n + 1));
  const placement = useStage(dep);
  // Faithful legacy consumer for the old-source negative control; every case still runs.
  const [ref, old] = Array.isArray(placement) ? placement : [placement];
  return h('div', { id: 'shell', style: { position: 'fixed', inset: 0,
    '--hole-top': '100px', '--hole-bottom': '456px' } },
    h('div', { id: 'area', style: { position: 'absolute', top: 'var(--hole-top)',
      bottom: 'var(--hole-bottom)', left: 12, right: 12, display: 'flex',
      alignItems: 'center', justifyContent: 'center' } },
      h('p', { ref, id: 'moment', ...(old ? { 'data-stage': old.how,
        'data-shift': old.dy, style: { translate: '0 ' + old.dy + 'px' } } : {}) }, 'Your turn')),
    h('div', { 'data-hud-stack': true, id: 'hud' },
      h('span', { 'data-testid': 'resource-flash', id: 'gain' }, '+2')));
}
createRoot(document.getElementById('root')).render(h(App));
`;
const vite = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: PORT, strictPort: true },
  plugins: [{ name: 'stage-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/__stage-probe.js') return '\0stage-probe'; },
    load(id) { if (id === '\0stage-probe') return probe; },
    configureServer(server) { server.middlewares.use((req, res, next) => {
      if (req.url !== '/stage-probe') return next();
      res.setHeader('Content-Type', 'text/html');
      res.end('<style>body{margin:0}#moment{box-sizing:border-box;width:220px;height:67px;margin:0;background:white}#hud{position:fixed;left:12px;right:12px;top:620px;height:190px}#gain{position:absolute;left:236px;top:20px;width:34px;height:22px}</style><div id="root"></div><script type="module" src="/__stage-probe.js"></script>');
    }); },
  }],
});
let browser;
let failures = 0;
const errors = [];
function check(ok, label, data) {
  console.log((ok ? 'ok  ' : 'FAIL ') + label + ' ' + JSON.stringify(data));
  if (!ok) failures++;
}
try {
  await vite.listen();
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ||
    (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + PORT + '/stage-probe');
  await page.waitForSelector('#moment');
  const samples = await page.evaluate(async () => {
    const shell = document.querySelector('#shell');
    const box = id => {
      const { x, y, width, height, top, bottom, left, right } = document.querySelector(id).getBoundingClientRect();
      return { x, y, width, height, top, bottom, left, right };
    };
    const sample = label => ({ label, area: box('#area'), moment: box('#moment'),
      hud: box('#hud'), gain: box('#gain'), stage: document.querySelector('#moment').dataset.stage,
      shift: Number(document.querySelector('#moment').dataset.shift), text: document.querySelector('#moment').textContent });
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const writeThenSample = (top, bottom, label) => new Promise(resolve => {
      requestAnimationFrame(() => {
        shell.style.setProperty('--hole-top', top + 'px');
        shell.style.setProperty('--hole-bottom', bottom + 'px');
      });
      requestAnimationFrame(() => resolve(sample(label)));
    });
    const move = async (top, bottom, label) => {
      shell.style.setProperty('--hole-top', top + 'px');
      shell.style.setProperty('--hole-bottom', bottom + 'px');
      await frame();
      return sample(label);
    };
    await frame(); await frame();
    const out = [sample('initial clear centre')];
    out.push(await move(500, 56, 'same-size position refit: first frame'));
    await frame(); out.push(sample('same-size position refit: next frame'));
    window.rerender(); out.push(sample('React dependency update while moved'));
    out.push(await move(103, 360, 'restore observed pre-refit hole'));
    await frame();
    out.push(await writeThenSample(500, 56, 'size-changing refit: writer and reader RAFs in one frame'));
    out.push(await move(100, 456, 'restore clear centre: first frame'));
    return out;
  });
  const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  for (const s of samples) {
    check(!overlaps(s.moment, s.gain) && !overlaps(s.moment, s.hud), s.label + ': no cover', s);
    check(s.moment.top >= s.area.top && s.moment.bottom <= s.area.bottom && s.text === 'Your turn',
      s.label + ': visible cue stays inside hole', { top: s.moment.top, bottom: s.moment.bottom });
    if (s.area.top === 500) check(s.stage === 'moved' && s.shift < 0 && s.moment.bottom <= s.hud.top - 8,
      s.label + ': existing least-move clearance', { stage: s.stage, shift: s.shift, bottom: s.moment.bottom });
    if (s.area.top === 100) check(s.stage === 'centre' && s.shift === 0, s.label + ': centre restored', s.stage);
  }
  check(samples[0].area.height === samples[1].area.height, 'position-only refit retains area size', samples[1].area.height);
  check(errors.length === 0, 'no browser errors', errors);
} finally {
  await browser?.close();
  await vite.close();
}
if (failures) process.exitCode = 1;
