// Options page - save/load settings from chrome.storage.sync

const DEFAULT_SETTINGS = {
  deepseekKey: '',
  seatableServer: 'https://cloud.seatable.cn',
  seatableToken: '',
  seatableTable: '投递记录',
  userProfile: {
    education: [
      { school: '', major: '', period: '' },
      { school: '', major: '', period: '' }
    ],
    experience: [
      { company: '', period: '', position: '', description: '' },
      { company: '', period: '', position: '', description: '' },
      { company: '', period: '', position: '', description: '' }
    ],
    skills: '',
    description: ''
  }
};

// DOM elements
const form = document.getElementById('settings-form');
const statusMsg = document.getElementById('status-msg');

// --- Helpers ---

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Merge a saved array with defaults, ensuring minimum length.
 * Each item in saved is merged over the corresponding default.
 */
function mergeArrays(saved, defaults, minLength) {
  const arr = defaults.map((d, i) => ({ ...d, ...(saved?.[i] || {}) }));
  // Pad to minLength (shouldn't be needed but safe)
  while (arr.length < minLength) {
    arr.push({ ...defaults[arr.length % defaults.length] || defaults[0] });
  }
  return arr;
}

// --- Profile Rendering ---

function renderProfileFields(userProfile) {
  const container = document.getElementById('profile-fields');
  if (!container) return;

  const profile = userProfile || DEFAULT_SETTINGS.userProfile;
  const education = profile.education || DEFAULT_SETTINGS.userProfile.education;
  const experience = profile.experience || DEFAULT_SETTINGS.userProfile.experience;

  let html = '';

  // Education (2 blocks)
  html += '<div class="profile-section">';
  html += '<div class="profile-section-title">🎓 教育经历</div>';
  for (let i = 0; i < 2; i++) {
    const edu = education[i] || { school: '', major: '', period: '' };
    html += `
      <div class="profile-block">
        <div class="profile-inline">
          <div class="form-group">
            <label>学校</label>
            <input type="text" class="edu-school" data-index="${i}" placeholder="学校名称" value="${escapeHtml(edu.school || '')}">
          </div>
          <div class="form-group">
            <label>专业</label>
            <input type="text" class="edu-major" data-index="${i}" placeholder="专业名称" value="${escapeHtml(edu.major || '')}">
          </div>
          <div class="form-group">
            <label>时间</label>
            <input type="text" class="edu-period" data-index="${i}" placeholder="2020.09 - 2024.06" value="${escapeHtml(edu.period || '')}">
          </div>
        </div>
      </div>`;
  }
  html += '</div>';

  // Experience (3 blocks)
  html += '<div class="profile-section">';
  html += '<div class="profile-section-title">💼 实习/工作经历</div>';
  for (let i = 0; i < 3; i++) {
    const exp = experience[i] || { company: '', period: '', position: '', description: '' };
    html += `
      <div class="profile-block">
        <div class="profile-inline">
          <div class="form-group">
            <label>公司/项目名称</label>
            <input type="text" class="exp-company" data-index="${i}" placeholder="公司名称" value="${escapeHtml(exp.company || '')}">
          </div>
          <div class="form-group">
            <label>时间</label>
            <input type="text" class="exp-period" data-index="${i}" placeholder="2023.07 - 2023.12" value="${escapeHtml(exp.period || '')}">
          </div>
          <div class="form-group">
            <label>岗位</label>
            <input type="text" class="exp-position" data-index="${i}" placeholder="岗位名称" value="${escapeHtml(exp.position || '')}">
          </div>
        </div>
        <div class="form-group" style="margin-top: 12px;">
          <label>实习介绍</label>
          <textarea class="exp-description" data-index="${i}" rows="3" placeholder="简要描述工作内容和成果">${escapeHtml(exp.description || '')}</textarea>
        </div>
      </div>`;
  }
  html += '</div>';

  // Skills
  html += '<div class="profile-section">';
  html += '<div class="profile-section-title">🛠 拥有技能</div>';
  html += `<div class="form-group">
    <textarea id="profile-skills" rows="4" placeholder="例如：Python、SQL、数据分析、用户研究、竞品分析、A/B 测试…">${escapeHtml(profile.skills || '')}</textarea>
  </div>`;
  html += '</div>';

  // Description
  html += '<div class="profile-section">';
  html += '<div class="profile-section-title">📝 基本描述</div>';
  html += `<div class="form-group">
    <textarea id="profile-description" rows="4" placeholder="简要描述你的求职方向、职业规划、个人特质等">${escapeHtml(profile.description || '')}</textarea>
  </div>`;
  html += '</div>';

  container.innerHTML = html;
}

// --- Profile Collection ---

function collectProfile() {
  const eduSchools = document.querySelectorAll('.edu-school');
  const eduMajors = document.querySelectorAll('.edu-major');
  const eduPeriods = document.querySelectorAll('.edu-period');

  const education = [];
  for (let i = 0; i < eduSchools.length; i++) {
    education.push({
      school: eduSchools[i]?.value?.trim() || '',
      major: eduMajors[i]?.value?.trim() || '',
      period: eduPeriods[i]?.value?.trim() || ''
    });
  }

  const expCompanies = document.querySelectorAll('.exp-company');
  const expPeriods = document.querySelectorAll('.exp-period');
  const expPositions = document.querySelectorAll('.exp-position');
  const expDescriptions = document.querySelectorAll('.exp-description');

  const experience = [];
  for (let i = 0; i < expCompanies.length; i++) {
    experience.push({
      company: expCompanies[i]?.value?.trim() || '',
      period: expPeriods[i]?.value?.trim() || '',
      position: expPositions[i]?.value?.trim() || '',
      description: expDescriptions[i]?.value?.trim() || ''
    });
  }

  return {
    education,
    experience,
    skills: document.getElementById('profile-skills')?.value?.trim() || '',
    description: document.getElementById('profile-description')?.value?.trim() || ''
  };
}

// --- Load / Save ---

async function loadSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  document.getElementById('deepseek-key').value = result.deepseekKey || '';
  document.getElementById('seatable-server').value = result.seatableServer || DEFAULT_SETTINGS.seatableServer;
  document.getElementById('seatable-token').value = result.seatableToken || '';
  document.getElementById('seatable-table').value = result.seatableTable || DEFAULT_SETTINGS.seatableTable;

  // Merge saved userProfile with defaults (handle first-time users / partial data)
  const saved = result.userProfile || {};
  const df = DEFAULT_SETTINGS.userProfile;
  const profile = {
    education: mergeArrays(saved.education, df.education, 2),
    experience: mergeArrays(saved.experience, df.experience, 3),
    skills: saved.skills ?? df.skills,
    description: saved.description ?? df.description
  };

  renderProfileFields(profile);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const settings = {
    deepseekKey: document.getElementById('deepseek-key').value.trim(),
    seatableServer: document.getElementById('seatable-server').value.trim() || DEFAULT_SETTINGS.seatableServer,
    seatableToken: document.getElementById('seatable-token').value.trim(),
    seatableTable: document.getElementById('seatable-table').value.trim() || DEFAULT_SETTINGS.seatableTable,
    userProfile: collectProfile()
  };

  try {
    await chrome.storage.sync.set(settings);
    showStatus('设置已保存', 'success');
  } catch (err) {
    showStatus('保存失败: ' + err.message, 'error');
  }
});

function showStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = `status ${type}`;
  setTimeout(() => {
    statusMsg.className = 'status hidden';
  }, 2500);
}

// Initialize
loadSettings();