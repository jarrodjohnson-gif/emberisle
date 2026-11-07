// Passive, non-equivalent diagnostics for the unchanged registered client proof.
// Any timings here include observer overhead and are not proof acceptance results.
import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import path from 'node:path';

const project = process.env.EMBER_CLIENT_ROOT;
const output = process.env.EMBER_CLIENT_TRACE;
if (!project || !output) throw new Error('Diagnostic root and output are required');
const { chromium } = createRequire(path.join(project, 'package.json'))('playwright');
const seen = new WeakSet();
const started = process.hrtime.bigint();
const observer = 'p905-client-observe';
const record = (kind, data = {}) => appendFileSync(output, JSON.stringify({
  at: new Date().toISOString(),
  elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
  observer,
  diagnosticOnly: true,
  proofEquivalent: false,
  kind,
  ...data,
}) + '\n');
const safeUrl = raw => {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return String(raw).split(/[?#]/, 1)[0];
  }
};

function observe(page) {
  if (seen.has(page)) return;
  seen.add(page);

  page.on('domcontentloaded', () => record('domcontentloaded', { url: safeUrl(page.url()) }));
  page.on('request', request => {
    const url = safeUrl(request.url());
    const data = { url, method: request.method(), resourceType: request.resourceType() };
    record(request.resourceType() === 'document' ? 'document-request' : 'request', data);
  });
  page.on('response', response => record('response', {
    url: safeUrl(response.url()),
    status: response.status(),
    method: response.request().method(),
    resourceType: response.request().resourceType(),
  }));
  page.on('requestfailed', request => record('requestfailed', {
    url: safeUrl(request.url()),
    method: request.method(),
    resourceType: request.resourceType(),
    failure: request.failure()?.errorText ?? null,
  }));
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) record('document-navigation', { url: safeUrl(frame.url()) });
  });
  page.on('pageerror', error => record('pageerror', { message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') record('consoleerror', { text: message.text() });
  });
  page.on('websocket', socket => {
    record('websocket-open', { url: safeUrl(socket.url()) });
    socket.on('framereceived', event => {
      let data;
      try {
        data = JSON.parse(String(event.payload));
      } catch (error) {
        record('vite-ws-unparsed-frame', { error: error instanceof Error ? error.message : String(error) });
        return;
      }
      if (['full-reload', 'update', 'error'].includes(data?.type)) {
        record('vite-ws-frame', {
          type: data.type,
          path: typeof data.path === 'string' ? data.path : undefined,
          updates: Array.isArray(data.updates)
            ? data.updates.map(item => ({ type: item.type, path: item.path }))
            : undefined,
          error: data.err
            ? { message: data.err.message, plugin: data.err.plugin, id: data.err.id }
            : undefined,
        });
      }
    });
  });

  // Intercept only the existing host-down `title-card`.waitFor call. Invoke the original method
  // with the same receiver and arguments, take one bounded read-only snapshot after rejection,
  // and throw the exact original error object after recording diagnostics.
  const originalGetByTestId = page.getByTestId.bind(page);
  page.getByTestId = function (testId, ...args) {
    const locator = originalGetByTestId(testId, ...args);
    if (testId !== 'title-card') return locator;
    const originalWaitFor = locator.waitFor.bind(locator);
    locator.waitFor = async function (...waitArgs) {
      try {
        return await originalWaitFor(...waitArgs);
      } catch (originalError) {
        record('title-card-wait-rejected', {
          timeoutMs: waitArgs[0]?.timeout ?? null,
          errorName: originalError?.name ?? null,
          errorMessage: originalError?.message ?? String(originalError),
          url: safeUrl(page.url()),
        });
        let timeout;
        try {
          const snapshot = await Promise.race([
            page.evaluate(() => {
              const appState = window.__emberisle?.getState?.();
              const titleCards = [...document.querySelectorAll('[data-testid="title-card"]')];
              const error = appState?.error;
              const safeError = typeof error === 'string'
                ? error
                : error && typeof error.message === 'string'
                  ? error.message
                  : error == null
                    ? null
                    : Object.prototype.toString.call(error);
              const titleCardDOMSummary = titleCards.map(element => {
                const style = getComputedStyle(element);
                return {
                  tag: element.tagName.toLowerCase(),
                  id: element.id || null,
                  className: typeof element.className === 'string' ? element.className : null,
                  role: element.getAttribute('role'),
                  ariaHidden: element.getAttribute('aria-hidden'),
                  childElementCount: element.childElementCount,
                  visible: element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none',
                };
              });
              return {
                screen: appState?.screen ?? null,
                mode: appState?.mode ?? null,
                restoring: appState?.restoring ?? null,
                error: safeError,
                netPresent: appState ? appState.net != null : null,
                seatPresent: localStorage.getItem('emberisle-seat') !== null,
                liveSeatPresent: localStorage.getItem('emberisle-seat-live') !== null,
                titleCardCount: titleCards.length,
                titleCardDOMSummary,
                url: location.href,
              };
            }),
            new Promise((_, reject) => {
              timeout = setTimeout(() => reject(new Error('post-failure snapshot exceeded 1200 ms diagnostic bound')), 1200);
            }),
          ]);
          record('title-card-post-failure-snapshot', snapshot);
        } catch (snapshotError) {
          record('title-card-post-failure-snapshot-failed', {
            message: snapshotError instanceof Error ? snapshotError.message : String(snapshotError),
            url: safeUrl(page.url()),
          });
        } finally {
          clearTimeout(timeout);
        }
        throw originalError;
      }
    };
    return locator;
  };
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
