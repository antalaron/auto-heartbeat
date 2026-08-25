import '../shared/browserPolyfill.js';
import * as configService from '../services/configService.js';
import { requestSchedulerRun } from '../shared/messaging.js';
import { initRuleDialog, openAddDialog, openEditDialog } from './ruleDialog.js';
import { renderLogsPanel } from './logsPanel.js';

const rulesListElement = document.getElementById('rules-list');
const rulesEmptyState = document.getElementById('rules-empty-state');
const rulesSummary = document.getElementById('rules-summary');
const addRuleButton = document.getElementById('add-rule-button');
const tabButtons = document.querySelectorAll('.tabs__button');
const panels = {
  rules: document.getElementById('rules-panel'),
  logs: document.getElementById('logs-panel'),
};

async function renderRulesPanel() {
  const configs = await configService.listConfigs();
  const enabledCount = configs.filter((config) => config.enabled).length;
  rulesSummary.textContent = `${configs.length} rule${configs.length === 1 ? '' : 's'} configured · ${enabledCount} enabled`;

  rulesListElement.innerHTML = '';
  if (configs.length === 0) {
    rulesEmptyState.hidden = false;
    return;
  }
  rulesEmptyState.hidden = true;

  for (const config of configs) {
    rulesListElement.appendChild(buildRuleCard(config));
  }
}

/**
 * @param {import('../models/heartbeatConfig.js').HeartbeatConfig} config
 * @returns {HTMLElement}
 */
function buildRuleCard(config) {
  const card = document.createElement('article');
  card.className = `rule-card${config.enabled ? '' : ' rule-card--disabled'}`;

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'switch';
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.checked = config.enabled;
  toggleInput.setAttribute('aria-label', `Toggle rule ${config.name || config.domain}`);
  toggleInput.addEventListener('change', async () => {
    await configService.setConfigEnabled(config.id, toggleInput.checked);
    requestSchedulerRun();
    renderRulesPanel();
  });
  const toggleTrack = document.createElement('span');
  toggleTrack.className = 'switch__track';
  toggleLabel.append(toggleInput, toggleTrack);

  const main = document.createElement('div');
  main.className = 'rule-card__main';

  const title = document.createElement('div');
  title.className = 'rule-card__title';
  title.textContent = config.name || config.domain;

  const badge = document.createElement('span');
  badge.className = 'badge badge--muted';
  badge.textContent = config.method;
  title.appendChild(badge);

  const details = document.createElement('div');
  details.className = 'rule-card__details';
  details.textContent = `${config.domain} → ${config.url} · every ${config.interval} min`;

  main.append(title, details);

  const actions = document.createElement('div');
  actions.className = 'rule-card__actions';

  const editButton = document.createElement('button');
  editButton.className = 'button button--ghost';
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => openEditDialog(config));

  const deleteButton = document.createElement('button');
  deleteButton.className = 'button button--danger';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', async () => {
    const label = config.name || config.domain;
    if (window.confirm(`Delete the heartbeat rule for "${label}"? This cannot be undone.`)) {
      await configService.deleteConfig(config.id);
      requestSchedulerRun();
      renderRulesPanel();
    }
  });

  actions.append(editButton, deleteButton);
  card.append(toggleLabel, main, actions);
  return card;
}

/**
 * @param {'rules'|'logs'} tabName
 */
function switchTab(tabName) {
  for (const button of tabButtons) {
    const isSelected = button.dataset.tab === tabName;
    button.setAttribute('aria-selected', String(isSelected));
  }
  for (const [name, panel] of Object.entries(panels)) {
    panel.hidden = name !== tabName;
  }
  if (tabName === 'logs') renderLogsPanel();
}

for (const button of tabButtons) {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
}

addRuleButton.addEventListener('click', () => openAddDialog());

initRuleDialog(() => {
  renderRulesPanel();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.configs) renderRulesPanel();
  if (changes.logs && !panels.logs.hidden) renderLogsPanel();
});

renderRulesPanel();
