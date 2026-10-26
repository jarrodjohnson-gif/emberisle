// Passive diagnostics for the existing registered client proof; no assertions or waits change.
import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
const project = process.env.EMBER_CLIENT_ROOT;
const output = process.env.EMBER_CLIENT_TRACE;
if (!project || !output) throw new Error('Diagnostic root and output are required');
const { chromium } = createRequire(path.join(project, 'package.json'))('playwright');
const seen = new WeakSet();
const record = (kind, data) => appendFileSync(output, JSON.stringify({ at: new Date().toISOString(), kind, ...data }) + '\n');
function observe(page) {
  if (seen.has(page)) return;
  seen.add(page);
  page.on('domcontentloaded', () => record('domcontentloaded', { url: page.url() }));
  page.on('request', request => {
    if (request.resourceType() === 'document') record('document-request', { url: request.url() });
  });
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) record('navigation', { url: frame.url() });
  });
  page.on('requestfailed', request => {
    if (/127\.0\.0\.1.*\/(src|@vite|node_modules)\//.test(request.url()))
      record('requestfailed', { url: request.url(), failure: request.failure() });
  });
  page.on('pageerror', error => record('pageerror', { message: error.message }));
  page.on('response', response => {
    if (response.status() >= 400 && /127\.0\.0\.1.*\/(src|@vite|node_modules)\//.test(response.url()))
      record('response', { url: response.url(), status: response.status() });
  });
  page.on('console', message => {
    if (message.type() === 'error') record('consoleerror', { text: message.text() });
  });
  page.on('websocket', socket => {
    socket.on('framereceived', event => {
      try {
        const data = JSON.parse(String(event.payload));
        if (['full-reload', 'update', 'error'].includes(data.type))
          record('vite', { type: data.type, path: data.path, updates: data.updates?.map(item => ({ type: item.type, path: item.path })),
            error: data.err ? { message: data.err.message, plugin: data.err.plugin, id: data.err.id } : undefined });
      } catch {}
    });
  });
}
const launch = chromium.launch.bind(chromium);
chromium.launch = async options => {
  const browser = await launch(options);
  record('browser', { version: browser.version(), project });
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async options => {
    const page = await newPage(options);
    observe(page);
    return page;
  };
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await newContext(options);
    context.on('page', observe);
    return context;
  };
  return browser;
};
