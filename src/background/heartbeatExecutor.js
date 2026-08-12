/**
 * Executed *inside* the matching browser tab via `browser.scripting.executeScript`,
 * so the request naturally shares that tab's cookie jar - which is exactly
 * the tab's Firefox container (cookie store). This is what allows two
 * containers on the same domain to keep two fully independent sessions
 * alive. Running the same `fetch()` from the background script instead
 * would always use the default cookie store and break container isolation.
 *
 * Must remain a pure, self-contained function body: it is serialized and
 * injected by the browser, so it cannot close over anything from this
 * module's outer scope.
 *
 * @param {'GET'|'POST'} method
 * @param {string} url
 * @param {Record<string,string>} headers
 * @param {string} body
 * @returns {Promise<{success: boolean, status: number|null, durationMs: number, error: string|null}>}
 */
function sendHeartbeatInPage(method, url, headers, body) {
  const start = performance.now();
  const init = {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: headers || {},
  };
  if (method === 'POST' && body) {
    init.body = body;
  }

  return fetch(url, init)
    .then((response) => ({
      success: response.ok,
      status: response.status,
      durationMs: Math.round(performance.now() - start),
      error: response.ok ? null : `HTTP ${response.status} ${response.statusText}`.trim(),
    }))
    .catch((error) => ({
      success: false,
      status: null,
      durationMs: Math.round(performance.now() - start),
      error: error && error.message ? error.message : String(error),
    }));
}

/**
 * Runs a heartbeat request for `config` inside the context of `tabId`.
 * Gracefully degrades to a failure result (never throws) if the tab has
 * since navigated away, closed, or script injection is otherwise refused
 * (e.g. a privileged page).
 *
 * @param {number} tabId
 * @param {import('../models/heartbeatConfig.js').HeartbeatConfig} config
 * @returns {Promise<{success: boolean, status: number|null, durationMs: number, error: string|null}>}
 */
export async function executeHeartbeat(tabId, config) {
  const start = performance.now();
  try {
    const injectionResults = await browser.scripting.executeScript({
      target: { tabId },
      func: sendHeartbeatInPage,
      args: [config.method, config.url, config.headers, config.body],
    });

    const [firstResult] = injectionResults || [];
    if (!firstResult || !firstResult.result) {
      throw new Error('No result returned from the injected heartbeat script.');
    }
    return firstResult.result;
  } catch (error) {
    return {
      success: false,
      status: null,
      durationMs: Math.round(performance.now() - start),
      error: error && error.message ? error.message : String(error),
    };
  }
}
