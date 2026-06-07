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

document.addEventListener('click', e => {
    const wrap = document.getElementById('p-colour-swatch')?.closest('.colour-picker-wrap');
    if (wrap && !wrap.contains(e.target)) closeColourPicker();
});

// --- Modal Open / Close ---
function openProjectModal() {
    modalMode = 'add';
    activeProjectId = null;

    document.getElementById('printer-modal-title').textContent = 'NEW PROJECT';
    document.getElementById('printer-confirm').textContent = 'Add Project';
    document.getElementById('printer-remove').style.display = 'none';

    document.getElementById('p-name').value = '';
    document.getElementById('p-description').value = '';

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
