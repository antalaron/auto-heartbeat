import * as logService from '../services/logService.js';
import { formatTimestamp, formatDuration } from '../utils/time.js';

const LOG_DISPLAY_LIMIT = 100;

/**
 * Renders the activity log panel with the most recent heartbeat results.
 *
 * @returns {Promise<void>}
 */
export async function renderLogsPanel() {
  const logs = await logService.getRecentLogs(LOG_DISPLAY_LIMIT);
  const list = document.getElementById('logs-list');
  const emptyState = document.getElementById('logs-empty-state');
  list.innerHTML = '';

  if (logs.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  for (const entry of logs) {
    list.appendChild(buildLogCard(entry));
  }
}

/**
 * @param {import('../models/logEntry.js').LogEntry} entry
 * @returns {HTMLElement}
 */
function buildLogCard(entry) {
  const card = document.createElement('article');
  card.className = 'log-card';

  const title = document.createElement('div');
  title.className = 'log-card__title';

  const badge = document.createElement('span');
  badge.className = `badge ${entry.success ? 'badge--success' : 'badge--danger'}`;
  badge.textContent = entry.success ? 'Success' : 'Failed';

  const name = document.createElement('span');
  name.textContent = entry.configName;

  title.append(badge, name);

  const meta = document.createElement('div');
  meta.className = 'log-card__meta';
  const containerText = entry.containerName ? ` · ${entry.containerName}` : '';
  const statusText = entry.status ? `HTTP ${entry.status}` : 'No response';
  meta.textContent = `${formatTimestamp(entry.timestamp)} · ${entry.method} ${entry.domain}${containerText} · ${statusText} · ${formatDuration(entry.durationMs)}`;

  card.append(title, meta);

  if (!entry.success && entry.error) {
    const error = document.createElement('div');
    error.className = 'log-card__error';
    error.textContent = entry.error;
    card.appendChild(error);
  }

  return card;
}
