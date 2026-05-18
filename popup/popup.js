// Popup logic - page extraction, LLM call, form handling, SeaTable save

import { SeaTableClient } from '../lib/seatable.js';
import { extractJobInfo } from '../lib/deepseek.js';

// --- State ---
const DEFAULT_SETTINGS = {
  deepseekKey: '',
  seatableServer: 'https://cloud.seatable.cn',
  seatableToken: '',
  seatableTable: '投递记录'
};

const PRESET_STATUSES = ['简历初筛', '部门评估', '笔试中', '面试中', '挂', 'offer'];

// --- DOM Elements ---
function $(id) { return document.getElementById(id); }

// --- State Management ---
function showState(stateId) {
  ['state-loading', 'state-form', 'state-noconfig', 'state-success', 'state-error']
    .forEach(id => $(id).classList.add('hidden'));
  $(stateId).classList.remove('hidden');
}

// --- Form Helpers ---
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function populateForm(data, pageUrl) {
  $('company').value = data.company || '';
  $('position').value = data.position || '';
  setStatusValue(data.status || '');
  $('location').value = data.location || '';
  $('link').value = pageUrl || '';
  $('apply-date').value = data.apply_date || getTodayStr();
  $('intro').value = '';
}

function setStatusValue(status) {
  const select = $('status-select');
  const customInput = $('status-custom');

  if (PRESET_STATUSES.includes(status)) {
    select.value = status;
    customInput.classList.add('hidden');
    customInput.value = '';
  } else if (status) {
    select.value = '__custom__';
    customInput.classList.remove('hidden');
    customInput.value = status;
  } else {
    select.value = '';
    customInput.classList.add('hidden');
  }
}

function getStatusValue() {
  const select = $('status-select');
  if (select.value === '__custom__') {
    return $('status-custom').value.trim();
  }
  return select.value;
}

function getFormData() {
  return {
    '公司': $('company').value.trim(),
    '岗位': $('position').value.trim(),
    '状态': getStatusValue(),
    '地点': $('location').value.trim(),
    '链接': $('link').value.trim(),
    '投递日期': $('apply-date').value,
    '自我介绍': $('intro').value.trim()
  };
}

// --- Status dropdown: custom option handling ---
async function loadCustomStatuses() {
  const { customStatuses } = await chrome.storage.local.get('customStatuses');
  return customStatuses || [];
}

async function addCustomStatus(status) {
  const { customStatuses } = await chrome.storage.local.get('customStatuses');
  const list = customStatuses || [];
  if (!list.includes(status)) {
    list.push(status);
    await chrome.storage.local.set({ customStatuses: list });
  }
}

async function updateStatusDropdown() {
  const select = $('status-select');
  const customStatuses = await loadCustomStatuses();

  const currentValue = select.value;
  select.innerHTML = '<option value="">-- 请选择 --</option>';
  PRESET_STATUSES.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  customStatuses.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  const divider = document.createElement('option');
  divider.disabled = true;
  divider.textContent = '──────────';
  select.appendChild(divider);
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = '+ 自定义输入…';
  select.appendChild(customOpt);

  select.value = currentValue || '';
}

// --- Main Flow ---
async function main() {
  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);

    const hasDeepseek = !!settings.deepseekKey;
    const hasSeatable = !!(settings.seatableToken && settings.seatableTable);

    if (!hasDeepseek || !hasSeatable) {
      showState('state-noconfig');
      return;
    }

    showState('state-loading');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageUrl = tab.url;

    let pageText = '';
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body.innerText
      });
      pageText = results[0]?.result || '';
    } catch {
      pageText = '';
    }

    let extractedData;
    try {
      extractedData = await extractJobInfo(pageText, settings.deepseekKey);
    } catch (err) {
      console.error('LLM extraction failed:', err);
      extractedData = { company: '', position: '', status: '', location: '', apply_date: getTodayStr() };
    }

    await updateStatusDropdown();
    populateForm(extractedData, pageUrl);
    showState('state-form');

  } catch (err) {
    console.error('Popup init error:', err);
    showError(err.message);
  }
}

function showError(msg) {
  $('error-msg').textContent = msg;
  showState('state-error');
}

// --- Event Handlers ---
$('status-select').addEventListener('change', () => {
  const select = $('status-select');
  const customInput = $('status-custom');
  if (select.value === '__custom__') {
    customInput.classList.remove('hidden');
    customInput.focus();
  } else {
    customInput.classList.add('hidden');
    customInput.value = '';
  }
});

$('job-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveBtn = $('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中…';

  try {
    const statusVal = getStatusValue();
    if (statusVal && !PRESET_STATUSES.includes(statusVal)) {
      await addCustomStatus(statusVal);
    }

    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const rowData = getFormData();

    const client = new SeaTableClient(settings.seatableServer, settings.seatableToken);
    const dup = await client.hasDuplicateLink(settings.seatableTable, rowData['链接']);
    if (dup) {
      const proceed = confirm('该职位链接可能已记录过，是否仍然保存？');
      if (!proceed) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 保存到 SeaTable';
        return;
      }
    }

    await client.appendRow(settings.seatableTable, rowData);

    const preview = $('saved-preview');
    preview.innerHTML = `
      <strong>${rowData['公司'] || '(未填)'}</strong><br>
      ${rowData['岗位'] || ''} | ${rowData['状态'] || ''}<br>
      ${rowData['地点'] || ''} | ${rowData['投递日期']}
    `;
    showState('state-success');

  } catch (err) {
    console.error('Save failed:', err);
    showError(err.message);
  }
});

$('reanalyze-btn').addEventListener('click', () => {
  showState('state-loading');
  setTimeout(() => main(), 100);
});

$('open-settings-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

$('new-record-btn').addEventListener('click', () => {
  showState('state-loading');
  setTimeout(() => main(), 100);
});

$('close-btn').addEventListener('click', () => {
  window.close();
});

$('retry-btn').addEventListener('click', () => {
  showState('state-loading');
  setTimeout(() => main(), 100);
});

$('manual-btn').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await updateStatusDropdown();
    populateForm({ company: '', position: '', status: '', location: '', apply_date: getTodayStr() }, tab.url);
    showState('state-form');
  } catch (err) {
    showError(err.message);
  }
});

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(DEFAULT_SETTINGS).then(settings => {
    if (!settings.deepseekKey || !settings.seatableToken || !settings.seatableTable) {
      showState('state-noconfig');
      return;
    }
    main();
  });
});
