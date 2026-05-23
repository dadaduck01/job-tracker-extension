// Popup logic — two independent modes: job tracking + JD analysis

import { SeaTableClient } from '../lib/seatable.js';
import { extractJobInfo, analyzeJD, generateAdvice, hasProfileContent } from '../lib/deepseek.js';

// --- Config ---
const DEFAULT_SETTINGS = {
  deepseekKey: '',
  seatableServer: 'https://cloud.seatable.cn',
  seatableToken: '',
  seatableTable: '投递记录',
  userProfile: null
};

const PRESET_STATUSES = ['简历初筛', '部门评估', '笔试中', '面试中', '挂', 'offer'];
const ALL_STATES = ['state-home', 'state-loading', 'state-form', 'state-jd',
                    'state-success', 'state-error', 'state-noconfig'];

// Track which mode is active (for retry)
let currentMode = null; // 'track' | 'jd'

// Store the last JD analysis result for advice generation
let jdAnalysis = null;

// --- Helpers ---
function $(id) { return document.getElementById(id); }

function showState(stateId) {
  ALL_STATES.forEach(id => $(id).classList.add('hidden'));
  $(stateId).classList.remove('hidden');
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Page Text Extraction ---
async function getPageText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText
    });
    return { text: results[0]?.result || '', url: tab.url };
  } catch {
    return { text: '', url: tab.url };
  }
}

// === MODE 1: Job Tracking ===

async function runJobTracking() {
  currentMode = 'track';
  showState('state-loading');
  $('loading-text').textContent = '🔍 正在分析页面…';
  $('loading-sub').textContent = 'AI 正在提取投递信息';

  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const { text, url } = await getPageText();

    let data;
    try {
      data = await extractJobInfo(text, settings.deepseekKey);
    } catch {
      data = { company: '', position: '', status: '', location: '', apply_date: getTodayStr() };
    }

    await updateStatusDropdown();
    $('company').value = data.company || '';
    $('position').value = data.position || '';
    setStatusValue(data.status || '');
    $('location').value = data.location || '';
    $('link').value = url || '';
    $('apply-date').value = data.apply_date || getTodayStr();
    $('intro').value = '';

    showState('state-form');
  } catch (err) {
    showError(err.message);
  }
}

// === MODE 2: JD Analysis ===

async function runJDAnalysis() {
  currentMode = 'jd';
  showState('state-loading');
  $('loading-text').textContent = '🔍 正在分析岗位…';
  $('loading-sub').textContent = '正在从页面提取职位信息';

  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const { text } = await getPageText();

    jdAnalysis = await analyzeJD(text, settings.deepseekKey, (msg) => {
      $('loading-sub').textContent = msg;
    });
    $('jd-overview').textContent = jdAnalysis.overview || '未能提取';
    $('jd-suitable').textContent = jdAnalysis.suitable || '未能提取';
    $('jd-skills').textContent = jdAnalysis.skills || '未能提取';

    // Reset advice section for fresh analysis
    $('jd-advice').classList.add('hidden');
    $('jd-advice').textContent = '';
    $('advice-hint').classList.add('hidden');

    // Show advice button only if user has filled profile
    const profile = settings.userProfile;
    if (!hasProfileContent(profile)) {
      $('advice-btn').classList.add('hidden');
      $('advice-hint').classList.remove('hidden');
    } else {
      $('advice-btn').classList.remove('hidden');
      $('advice-btn').disabled = false;
      $('advice-btn').textContent = '🔍 获取投递建议';
    }

    showState('state-jd');
  } catch (err) {
    showError(err.message);
  }
}

// === Shared: Error & Success ===

function showError(msg) {
  $('error-msg').textContent = msg;
  showState('state-error');
}

// --- Advice Card Rendering ---

function renderAdviceCard(a) {
  if (!a) return '<p>未能生成建议。</p>';

  const score = a.value_score;
  const riskColor = a.dirty_work_risk === '高' || a.dirty_work_risk === '很高'
    ? 'var(--red-600)' : '#D97706';

  const has = (field) => a[field] && a[field] !== '未能提取';

  return `
    <div class="advice-header">
      <span class="advice-score">
        ${a.job_value_recommendation || '—'}
        ${score != null ? `<span class="advice-score-num">${score}/100</span>` : ''}
      </span>
      ${a.dirty_work_risk ? `<span class="advice-risk" style="color:${riskColor}">⚠️ Dirty work 风险：${a.dirty_work_risk}</span>` : ''}
    </div>
    ${has('overall_judgement') ? `<div class="advice-block">${a.overall_judgement}</div>` : ''}
    ${has('valuable_signals') ? `<div class="advice-block"><span class="advice-label">✅ 价值信号</span>${a.valuable_signals}</div>` : ''}
    ${has('risk_signals') ? `<div class="advice-block"><span class="advice-label">⚠️ 风险信号</span>${a.risk_signals}</div>` : ''}
    ${has('resume_value') ? `<div class="advice-block"><span class="advice-label">📝 简历价值</span>${a.resume_value}</div>` : ''}
    ${has('learning_value') ? `<div class="advice-block"><span class="advice-label">📚 学习价值</span>${a.learning_value}</div>` : ''}
    ${has('apply_priority_reason') ? `<div class="advice-block"><span class="advice-label">🎯 投递优先级</span>${a.apply_priority_reason}</div>` : ''}
    ${a.questions_to_verify?.length ? `
      <div class="advice-block">
        <span class="advice-label">❓ 面试可追问</span>
        <ul class="advice-list">${a.questions_to_verify.map(q => `<li>${q}</li>`).join('')}</ul>
      </div>
    ` : ''}
    ${a.final_advice ? `<div class="advice-block advice-final">💡 ${a.final_advice}</div>` : ''}
  `;
}

// === Form Helpers ===

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
  if (select.value === '__custom__') return $('status-custom').value.trim();
  return select.value;
}

// --- Status Dropdown ---

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
    opt.value = s; opt.textContent = s;
    select.appendChild(opt);
  });
  customStatuses.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    select.appendChild(opt);
  });
  const div = document.createElement('option');
  div.disabled = true; div.textContent = '──────────';
  select.appendChild(div);
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__'; customOpt.textContent = '+ 自定义输入…';
  select.appendChild(customOpt);

  select.value = currentValue || '';
}

// === Event Handlers ===

// Home — action buttons
$('track-btn').addEventListener('click', () => runJobTracking());
$('analyze-btn').addEventListener('click', () => runJDAnalysis());
$('home-settings-btn').addEventListener('click', () => chrome.runtime.openOptionsPage());

// JD — get personalized advice
$('advice-btn').addEventListener('click', async () => {
  const btn = $('advice-btn');
  btn.disabled = true;
  btn.textContent = '⏳ 生成中…';

  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    const profile = settings.userProfile || {};

    if (!hasProfileContent(profile)) {
      $('jd-advice').innerHTML = '<p>请先在设置中填写个人信息。</p>';
      $('jd-advice').classList.remove('hidden');
      btn.classList.add('hidden');
      return;
    }

    const advice = await generateAdvice(jdAnalysis, profile, settings.deepseekKey, (msg) => {
      btn.textContent = msg;
    });

    $('jd-advice').innerHTML = renderAdviceCard(advice);
    $('jd-advice').classList.remove('hidden');
    btn.classList.add('hidden');
  } catch (err) {
    $('jd-advice').innerHTML = `<p style="color:var(--red-600);">生成建议失败: ${err.message}</p>`;
    $('jd-advice').classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = '🔍 重试';
  }
});

// Form — status dropdown
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

// Form — save
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
    const rowData = {
      '公司': $('company').value.trim(),
      '岗位': $('position').value.trim(),
      '状态': getStatusValue(),
      '地点': $('location').value.trim(),
      '链接': $('link').value.trim(),
      '投递日期': $('apply-date').value,
      '自我介绍': $('intro').value.trim()
    };

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

    $('saved-preview').innerHTML = `
      <strong>${rowData['公司'] || '(未填)'}</strong><br>
      ${rowData['岗位'] || ''} | ${rowData['状态'] || ''}<br>
      ${rowData['地点'] || ''} | ${rowData['投递日期']}
    `;
    showState('state-success');
  } catch (err) {
    showError(err.message);
  }
});

// Form — re-extract
$('reanalyze-btn').addEventListener('click', () => runJobTracking());

// Back buttons
$('form-back-btn').addEventListener('click', () => showState('state-home'));
$('jd-back-btn').addEventListener('click', () => showState('state-home'));
$('back-home-btn').addEventListener('click', () => showState('state-home'));
$('error-back-btn').addEventListener('click', () => showState('state-home'));

// Retry
$('retry-btn').addEventListener('click', () => {
  if (currentMode === 'jd') runJDAnalysis();
  else runJobTracking();
});

// Success → new record
$('new-record-btn').addEventListener('click', () => runJobTracking());

// Settings
$('open-settings-btn').addEventListener('click', () => chrome.runtime.openOptionsPage());

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!settings.deepseekKey || !settings.seatableToken || !settings.seatableTable) {
    showState('state-noconfig');
    return;
  }
  showState('state-home');
});
