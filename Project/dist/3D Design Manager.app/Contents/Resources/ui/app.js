const pill = document.querySelector('.nav-pill');

// --- Sidebar printer list ---
const PRINTER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="9" width="20" height="8" rx="2"/>
  <polyline points="6 9 6 3 18 3 18 9"/>
  <polyline points="6 17 6 21 18 21 18 17"/>
  <circle cx="18" cy="13" r="1" fill="currentColor" stroke="none"/>
</svg>`;

async function loadSidebarPrinters() {
    try {
        const data = await pywebview.api.LIST_PRINTERS(false);
        renderSidebarPrinters(data || []);
        (data || []).forEach(p => {
            checkPrinterStatus(p).then(({ status }) => {
                const dot = document.getElementById(`sb-dot-${p.printer_id}`);
                if (dot) dot.className = `sb-status-dot ${status}`;
            });
        });
    } catch {
        renderSidebarPrinters([]);
    }
}

function renderSidebarPrinters(data) {
    const container = document.getElementById('sidebar-printers');
    if (!container) return;
    container.innerHTML = '';
    data.forEach(p => {
        const status = p.status || 'offline';
        const url = p.IP_address && p.frontend_port
            ? `http://${p.IP_address}:${p.frontend_port}`
            : null;
        const item = document.createElement('div');
        item.className = 'sb-printer-item';
        item.title = p.name || 'Printer';
        item.innerHTML = `
            <div class="sb-printer-icon">${PRINTER_SVG}</div>
            <div class="sb-printer-row">
                <span class="sb-status-dot offline" id="sb-dot-${p.printer_id}"></span>
                <span class="sb-printer-name">${p.name || 'Printer'}</span>
            </div>`;
        item.addEventListener('click', () => {
            const target = url ?? 'equipment.html';
            navigate(target, document.getElementById('nav-equipment'));
        });
        container.appendChild(item);
    });
}

window.addEventListener('pywebviewready', loadSidebarPrinters);
if (window.pywebview) loadSidebarPrinters();
setInterval(loadSidebarPrinters, 30000);

function navigate(url, el) {
    if (el) {
        const rect = el.getBoundingClientRect();
        const headerRect = el.closest('header').getBoundingClientRect();
        pill.style.left = (rect.left - headerRect.left) + 'px';
        pill.style.width = rect.width + 'px';
    }

    if (!url.startsWith('http')) {
        document.getElementById('content').src = url;
        return;
    }

    fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(2000) })
        .then(() => document.getElementById('content').src = url)
        .catch(() => {
            document.getElementById('content').src = 'equipment.html';
            showToast('Failed to load page, Please check the 3D Printer Settings', true);
        });
}

// Set pill to first link on startup
window.addEventListener('DOMContentLoaded', () => {
    const firstLink = document.querySelector('header a');
    if (firstLink) firstLink.click();
});



let _settingsExtensions = [];
let _settingsDir = '';
let _selectedExt = null;
let _extEditing = false;

async function OpenSettingsModal() {
    document.getElementById('settings-modal').classList.add('open');
    _selectedExt = null;
    _extEditing = false;
    try {
        const s = await pywebview.api.GET_SETTINGS();
        _settingsExtensions = (s.File_Extensions || []).map(e => e.toLowerCase().replace(/^\./, ''));
        _settingsDir = s.Project_Directory || '';
    } catch {
        _settingsExtensions = [];
        _settingsDir = '';
    }
    document.getElementById('settings-dir-path').textContent = _settingsDir || '(not set)';
    renderExtList();
}

function renderExtList() {
    const list = document.getElementById('ext-list');
    list.innerHTML = '';
    _settingsExtensions.forEach(ext => {
        const row = document.createElement('div');
        row.className = 'ext-list-item' + (ext === _selectedExt ? ' selected' : '');
        row.textContent = ext;
        row.addEventListener('click', () => {
            if (_extEditing) return;
            _selectedExt = _selectedExt === ext ? null : ext;
            renderExtList();
        });
        list.appendChild(row);
    });
    document.getElementById('ext-remove-btn').disabled = !_selectedExt;
}

function beginAddExt() {
    if (_extEditing) return;
    _extEditing = true;
    _selectedExt = null;
    document.getElementById('ext-remove-btn').disabled = true;

    const list = document.getElementById('ext-list');
    const row = document.createElement('div');
    row.className = 'ext-list-item editing';

    const input = document.createElement('input');
    input.className = 'ext-list-input';
    input.placeholder = 'e.g. stl';
    input.maxLength = 20;
    input.autocomplete = 'off';
    row.appendChild(input);
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
    input.focus();

    let committed = false;
    function commit() {
        if (committed) return;
        committed = true;
        const val = input.value.trim().toLowerCase().replace(/^\./, '');
        if (val && !_settingsExtensions.includes(val)) {
            _settingsExtensions.push(val);
        }
        _extEditing = false;
        renderExtList();
    }
    function cancel() {
        if (committed) return;
        committed = true;
        _extEditing = false;
        renderExtList();
    }
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
}

function removeSelectedExt() {
    if (!_selectedExt) return;
    _settingsExtensions = _settingsExtensions.filter(e => e !== _selectedExt);
    _selectedExt = null;
    renderExtList();
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.remove('open');
}

async function confirmSettingsModal() {
    try {
        const saved = await pywebview.api.UPDATE_SETTINGS({
            File_Extensions: _settingsExtensions,
            Project_Directory: _settingsDir,
        });
        if (_settingsDir && saved.Project_Directory !== _settingsDir) {
            showToast('Directory not found — keeping previous path', true);
        } else {
            showToast('Settings saved');
        }
    } catch {
        showToast('Failed to save settings', true);
    }
    closeSettingsModal();
}

document.getElementById('ext-add-btn').addEventListener('click', beginAddExt);
document.getElementById('ext-remove-btn').addEventListener('click', removeSelectedExt);

document.getElementById('settings-dir-browse').addEventListener('click', async () => {
    try {
        const dir = await pywebview.api.PICK_DIRECTORY();
        if (dir) {
            _settingsDir = dir;
            document.getElementById('settings-dir-path').textContent = _settingsDir;
        }
    } catch { /* user cancelled or not in webview */ }
});

document.getElementById('settings-modal').addEventListener('click', (event) => {
    if (event.target === document.getElementById('settings-modal')) {
        closeSettingsModal();
    }
});

window.OpenSettingsModal = OpenSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.confirmSettingsModal = confirmSettingsModal;