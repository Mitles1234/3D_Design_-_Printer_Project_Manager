// --- Modal State ---
let modalMode = 'add';
let activeProjectId = null;
let selectedAccentColour = COLOURS[0].hex;

// --- Build colour popover swatches (runs once on load) ---
(function buildColourPopover() {
    const popover = document.getElementById('p-colour-popover');
    COLOURS.forEach(({ hex, name }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'colour-popover-swatch';
        btn.style.background = hex;
        btn.dataset.colour = hex;
        btn.title = name;
        btn.addEventListener('click', () => pickColour(hex));
        popover.appendChild(btn);
    });
})();

// --- Colour Picker ---
function toggleColourPicker() {
    const popover = document.getElementById('p-colour-popover');
    popover.classList.contains('open') ? closeColourPicker() : popover.classList.add('open');
}

function closeColourPicker() {
    document.getElementById('p-colour-popover').classList.remove('open');
}

function pickColour(hex) {
    selectedAccentColour = hex;
    document.getElementById('p-colour-dot').style.background = hex;

    document.querySelectorAll('#p-colour-popover .colour-popover-swatch').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.colour === hex);
    });
}

document.addEventListener('mousedown', e => {
    const wrap = document.getElementById('p-colour-swatch')?.closest('.colour-picker-wrap');
    if (wrap && !wrap.contains(e.target)) closeColourPicker();
});

// Darken the generate button while the textarea has content
document.getElementById('ai-user-prompt').addEventListener('input', function () {
    const hasText = this.value.trim().length > 0;
    document.getElementById('ai-generate-btn').classList.toggle('ready', hasText);
    document.getElementById('ai-btn-wrap').classList.toggle('ready', hasText);
});

// --- API handle (mirrors equipment.js pattern) ---
function getApi() {
    try {
        if (window.pywebview?.api) return window.pywebview.api;
    } catch (_) {}
    try {
        if (window.parent && window.parent !== window && window.parent.pywebview?.api)
            return window.parent.pywebview.api;
    } catch (_) {}
    return null;
}

// --- Toast ---
function showToast(message) {
    const toast = document.getElementById('ai-toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// --- AI Generation ---
async function generateWithAI() {
    const prompt = document.getElementById('ai-user-prompt').value.trim();
    if (!prompt) {
        document.getElementById('ai-user-prompt').focus();
        return;
    }

    const btn = document.getElementById('ai-generate-btn');
    const wrap = document.getElementById('ai-btn-wrap');

    const api = getApi();
    if (!api) {
        showToast('ERROR: API NOT READY');
        return;
    }

    btn.disabled = true;
    btn.classList.remove('error', 'ready');
    wrap.classList.remove('error', 'ready');
    wrap.classList.add('generating');

    try {
        const result = await api.GENERATE_PROJECT_DETAILS(prompt);
        if (result.name) document.getElementById('p-name').value = result.name;
        if (result.description) document.getElementById('p-description').value = result.description;
    } catch (err) {
        const msg = err?.message || err?.toString() || 'Unknown error';
        console.error('AI generation failed:', msg);
        btn.classList.add('error');
        wrap.classList.add('error');
        showToast('AI failed: ' + msg.slice(0, 60));
        setTimeout(() => {
            btn.classList.remove('error');
            wrap.classList.remove('error');
        }, 3500);
    } finally {
        btn.disabled = false;
        wrap.classList.remove('generating');
        // Restore ready state if textarea still has content
        const hasText = document.getElementById('ai-user-prompt').value.trim().length > 0;
        btn.classList.toggle('ready', hasText && !btn.classList.contains('error'));
        wrap.classList.toggle('ready', hasText && !wrap.classList.contains('error'));
    }
}

// --- Modal Open / Close ---
function openProjectModal() {
    modalMode = 'add';
    activeProjectId = null;

    document.getElementById('printer-modal-title').textContent = 'NEW PROJECT';
    document.getElementById('printer-confirm').textContent = 'Add Project';
    document.getElementById('printer-remove').style.display = 'none';

    document.getElementById('p-name').value = '';
    document.getElementById('p-description').value = '';
    document.getElementById('ai-user-prompt').value = '';
    document.getElementById('ai-btn-wrap').classList.remove('generating', 'error', 'ready');
    document.getElementById('ai-generate-btn').classList.remove('error', 'ready');

    pickColour(COLOURS[0].hex);

    document.getElementById('printer-modal').classList.add('open');
}

function closeProjectModal() {
    closeColourPicker();
    document.getElementById('printer-modal').classList.remove('open');
}

// --- Confirm (Add) ---
async function confirmProjectModal() {
    const name = document.getElementById('p-name').value.trim();
    if (!name) {
        document.getElementById('p-name').focus();
        return;
    }

    const description = document.getElementById('p-description').value.trim();

    try {
        const project = await window.pywebview.api.CREATE_PROJECT(name, selectedAccentColour, description);
        console.log('Project created:', project);
        closeProjectModal();
    } catch (err) {
        console.error('CREATE_PROJECT failed:', err);
    }
}

// --- Remove ---
async function removeProjectFromModal() {
    if (!activeProjectId) return;

    try {
        await window.pywebview.api.DELETE_PROJECT(activeProjectId);
        closeProjectModal();
    } catch (err) {
        console.error('DELETE_PROJECT failed:', err);
    }
}
