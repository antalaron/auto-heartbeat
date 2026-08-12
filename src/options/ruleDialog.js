import * as configService from '../services/configService.js';
import { parseHeadersInput } from '../utils/validation.js';
import { requestSchedulerRun } from '../shared/messaging.js';

const dialog = document.getElementById('rule-dialog');
const form = document.getElementById('rule-form');
const titleElement = document.getElementById('rule-dialog-title');
const cancelButton = document.getElementById('rule-cancel-button');

const fields = {
  name: document.getElementById('field-name'),
  enabled: document.getElementById('field-enabled'),
  domain: document.getElementById('field-domain'),
  method: document.getElementById('field-method'),
  interval: document.getElementById('field-interval'),
  url: document.getElementById('field-url'),
  headers: document.getElementById('field-headers'),
  body: document.getElementById('field-body'),
};

const errorElements = {
  domain: document.getElementById('error-domain'),
  interval: document.getElementById('error-interval'),
  url: document.getElementById('error-url'),
  headers: document.getElementById('error-headers'),
  general: document.getElementById('error-general'),
};

/** ID of the rule currently being edited, or null when adding a new one. */
let editingId = null;

/** Callback invoked after a rule is successfully saved. */
let onSavedCallback = null;

/**
 * Wires up the dialog's static event listeners. Must be called once on
 * page load, before {@link openAddDialog}/{@link openEditDialog}.
 *
 * @param {() => void} onSaved Called after a rule is successfully saved.
 */
export function initRuleDialog(onSaved) {
  onSavedCallback = onSaved;
  cancelButton.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', handleSubmit);
  dialog.addEventListener('close', clearErrors);
}

/** Opens the dialog in "add" mode with blank defaults. */
export function openAddDialog() {
  editingId = null;
  titleElement.textContent = 'Add heartbeat rule';
  resetForm();
  clearErrors();
  dialog.showModal();
}

/**
 * Opens the dialog in "edit" mode, pre-filled with an existing rule.
 *
 * @param {import('../models/heartbeatConfig.js').HeartbeatConfig} config
 */
export function openEditDialog(config) {
  editingId = config.id;
  titleElement.textContent = 'Edit heartbeat rule';
  fields.name.value = config.name || '';
  fields.enabled.checked = Boolean(config.enabled);
  fields.domain.value = config.domain || '';
  fields.method.value = config.method || 'GET';
  fields.interval.value = String(config.interval || '');
  fields.url.value = config.url || '';
  fields.headers.value = Object.keys(config.headers || {}).length
    ? JSON.stringify(config.headers, null, 2)
    : '';
  fields.body.value = config.body || '';
  clearErrors();
  dialog.showModal();
}

function resetForm() {
  form.reset();
  fields.enabled.checked = true;
  fields.method.value = 'GET';
  fields.interval.value = '15';
}

function clearErrors() {
  for (const element of Object.values(errorElements)) {
    element.textContent = '';
  }
}

/**
 * @param {SubmitEvent} event
 */
async function handleSubmit(event) {
  event.preventDefault();
  clearErrors();

  const headersResult = parseHeadersInput(fields.headers.value);
  if (!headersResult.ok) {
    errorElements.headers.textContent = headersResult.error;
    return;
  }

  const input = {
    id: editingId || undefined,
    name: fields.name.value,
    enabled: fields.enabled.checked,
    domain: fields.domain.value,
    method: fields.method.value,
    interval: Number.parseInt(fields.interval.value, 10),
    url: fields.url.value,
    headers: headersResult.value,
    body: fields.body.value,
  };

  const result = await configService.saveConfig(input);
  if (!result.ok) {
    applyFieldErrors(result.errors);
    return;
  }

  dialog.close();
  requestSchedulerRun();
  if (onSavedCallback) onSavedCallback();
}

/**
 * @param {Record<string,string>} errors
 */
function applyFieldErrors(errors) {
  const unmapped = [];
  for (const [field, message] of Object.entries(errors)) {
    if (errorElements[field]) {
      errorElements[field].textContent = message;
    } else {
      unmapped.push(message);
    }
  }
  if (unmapped.length > 0) {
    errorElements.general.textContent = unmapped.join(' ');
  }
}
