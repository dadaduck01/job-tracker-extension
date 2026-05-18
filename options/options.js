// Options page - save/load settings from chrome.storage.sync

const DEFAULT_SETTINGS = {
  deepseekKey: '',
  seatableServer: 'https://cloud.seatable.cn',
  seatableToken: '',
  seatableTable: '投递记录'
};

// DOM elements
const form = document.getElementById('settings-form');
const statusMsg = document.getElementById('status-msg');

// Load saved settings
async function loadSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  document.getElementById('deepseek-key').value = result.deepseekKey || '';
  document.getElementById('seatable-server').value = result.seatableServer || DEFAULT_SETTINGS.seatableServer;
  document.getElementById('seatable-token').value = result.seatableToken || '';
  document.getElementById('seatable-table').value = result.seatableTable || DEFAULT_SETTINGS.seatableTable;
}

// Save settings
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const settings = {
    deepseekKey: document.getElementById('deepseek-key').value.trim(),
    seatableServer: document.getElementById('seatable-server').value.trim() || DEFAULT_SETTINGS.seatableServer,
    seatableToken: document.getElementById('seatable-token').value.trim(),
    seatableTable: document.getElementById('seatable-table').value.trim() || DEFAULT_SETTINGS.seatableTable
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
