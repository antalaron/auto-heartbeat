import * as configService from '../services/configService.js';
import * as logService from '../services/logService.js';
import * as storageManager from '../storage/storageManager.js';
import { formatCountdown, formatTimestamp, formatDuration } from '../utils/time.js';

const RECENT_LOG_LIMIT = 8;

/** Handle for the 1-second countdown refresh, so it can be cleared/replaced on re-render. */
let countdownTimer = null;

async function render() {
  const [configs, activeState, logs] = await Promise.all([
    configService.listConfigs(),
    storageManager.getActiveState(),
    logService.getRecentLogs(RECENT_LOG_LIMIT),
  ]);

  renderStats(configs, activeState);
  renderActiveList(activeState);
  renderRecentLogs(logs);
  scheduleCountdownRefresh(activeState);
}

function renderStats(configs, activeState) {
  document.getElementById('stat-total').textContent = String(configs.length);
  document.getElementById('stat-enabled').textContent = String(configs.filter((c) => c.enabled).length);
  document.getElementById('stat-active').textContent = String(activeState.sessions.length);
}

function renderActiveList(activeState) {
  const list = document.getElementById('active-list');
  const emptyState = document.getElementById('active-empty');
  list.innerHTML = '';

  if (activeState.sessions.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  for (const session of activeState.sessions) {
    const item = document.createElement('li');
    item.className = 'active-list__item';
    item.dataset.nextRunAt = String(session.nextRunAt);

    const title = document.createElement('div');
    title.className = 'active-list__title';
    title.textContent = session.configName;

    const meta = document.createElement('div');
    meta.className = 'active-list__meta';
    const containerLabel = session.containerName ? ` · ${session.containerName}` : '';
    meta.textContent = `${session.domain}${containerLabel}`;

    const countdown = document.createElement('div');
    countdown.className = 'active-list__countdown';
    countdown.dataset.role = 'countdown';
    countdown.textContent = `Next in ${formatCountdown(session.nextRunAt)}`;

    item.append(title, meta, countdown);
    list.appendChild(item);
  }
}

function renderRecentLogs(logs) {
  const list = document.getElementById('recent-logs');
  const emptyState = document.getElementById('logs-empty');
  list.innerHTML = '';

  if (logs.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  for (const entry of logs) {
    const item = document.createElement('li');
    item.className = `recent-logs__item recent-logs__item--${entry.success ? 'success' : 'failure'}`;

    const title = document.createElement('div');
    title.className = 'recent-logs__title';
    title.textContent = `${entry.configName} · ${entry.success ? 'OK' : 'Failed'}`;

    const meta = document.createElement('div');
    meta.className = 'recent-logs__meta';
    const statusText = entry.status ? `HTTP ${entry.status}` : entry.error || 'Network error';
    meta.textContent = `${formatTimestamp(entry.timestamp)} · ${statusText} · ${formatDuration(entry.durationMs)}`;

    item.append(title, meta);
    list.appendChild(item);
  }
}

function scheduleCountdownRefresh(activeState) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (activeState.sessions.length === 0) return;

  countdownTimer = setInterval(() => {
    document.querySelectorAll('[data-role="countdown"]').forEach((element) => {
      const parent = element.closest('.active-list__item');
      const nextRunAt = Number(parent.dataset.nextRunAt);
      element.textContent = `Next in ${formatCountdown(nextRunAt)}`;
    });
  }, 1000);
}

document.getElementById('open-options-button').addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.configs || changes.activeState || changes.logs) {
    render();
  }
});

render();
