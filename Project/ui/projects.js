// --- Project store ---
let PROJECTS = [];

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

// Project AI textarea → ready state
document.getElementById('ai-user-prompt').addEventListener('input', function () {
    const hasText = this.value.trim().length > 0;
    document.getElementById('ai-generate-btn').classList.toggle('ready', hasText);
    document.getElementById('ai-btn-wrap').classList.toggle('ready', hasText);
});

// Revision AI textarea → ready state
document.getElementById('r-ai-prompt').addEventListener('input', function () {
    const hasText = this.value.trim().length > 0;
    document.getElementById('r-ai-generate-btn').classList.toggle('ready', hasText);
    document.getElementById('r-ai-btn-wrap').classList.toggle('ready', hasText);
});

// Clear name error state as soon as the user starts typing
document.getElementById('p-name').addEventListener('input', function () {
    this.classList.remove('input-error');
});
document.getElementById('r-name').addEventListener('input', function () {
    this.classList.remove('input-error');
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

// --- Project grid ---
function renderProjectGrid() {
    const grid = document.getElementById('printers-grid');
    grid.innerHTML = '';
    PROJECTS.forEach(proj => grid.appendChild(buildProjectCard(proj)));
}

function buildProjectCard(proj) {
    const card = document.createElement('div');
    card.className = 'proj-card' + (proj.collapsed ? ' collapsed' : '');
    card.dataset.id = proj.project_id;
    card.style.setProperty('--proj-ac', proj.accent_colour);

    const arrow = document.createElement('div');
    arrow.className = 'proj-arrow';
    arrow.style.color = proj.accent_colour;
    arrow.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,6 8,10 12,6"/></svg>`;

    const info = document.createElement('div');
    info.className = 'proj-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'proj-name';
    nameEl.textContent = proj.project_name;
    info.appendChild(nameEl);
    if (proj.description) {
        const sub = document.createElement('div');
        sub.className = 'proj-sub';
        sub.textContent = proj.description;
        info.appendChild(sub);
    }

    const actions = document.createElement('div');
    actions.className = 'proj-hdr-actions';

    const btnRevision = document.createElement('button');
    btnRevision.className = 'btn-sm';
    btnRevision.innerHTML = `<i class="ti ti-plus" aria-hidden="true"></i> Revision`;
    btnRevision.addEventListener('click', e => { e.stopPropagation(); addRevision(proj.project_id); });

    const btnEdit = document.createElement('button');
    btnEdit.className = 'icon-button';
    btnEdit.title = 'Edit project';
    btnEdit.innerHTML = `<i class="ti ti-pencil" aria-hidden="true"></i>`;
    btnEdit.addEventListener('click', e => { e.stopPropagation(); openEditProjectModal(proj); });

    actions.append(btnRevision, btnEdit);

    const hdr = document.createElement('div');
    hdr.className = 'proj-hdr';
    hdr.append(arrow, info, actions);
    hdr.addEventListener('click', () => {
        proj.collapsed = !proj.collapsed;
        card.classList.toggle('collapsed', proj.collapsed);
        const api = getApi();
        if (api) api.UPDATE_PROJECT(proj.project_id, { collapsed: proj.collapsed }).catch(() => {});
    });

    const body = document.createElement('div');
    body.className = 'proj-body';
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'proj-canvas-wrap';

    const nodes = proj.nodes || [];
    if (nodes.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'proj-canvas-empty';
        emptyMsg.textContent = 'No iterations yet';
        canvasWrap.appendChild(emptyMsg);
    } else {
        const row = document.createElement('div');
        row.className = 'proj-nodes-row';
        nodes.forEach(node => {
            const card = document.createElement('div');
            card.className = 'node-card';
            card.style.setProperty('--proj-ac', proj.accent_colour);

            const nameEl = document.createElement('div');
            nameEl.className = 'node-card-name';
            nameEl.textContent = node.node_name;
            card.appendChild(nameEl);

            if (node.description) {
                const descEl = document.createElement('div');
                descEl.className = 'node-card-desc';
                descEl.textContent = node.description;
                card.appendChild(descEl);
            }

            row.appendChild(card);
        });
        canvasWrap.appendChild(row);
    }

    body.appendChild(canvasWrap);

    card.append(hdr, body);
    return card;
}

function updateStats() {
    document.getElementById('stat-projects').textContent = PROJECTS.length;
}

async function deleteProject(projectId) {
    const api = getApi();
    if (!api) return;
    try {
        await api.DELETE_PROJECT(projectId);
        PROJECTS = PROJECTS.filter(p => p.project_id !== projectId);
        renderProjectGrid();
        updateStats();
    } catch (e) {
        console.error('DELETE_PROJECT failed:', e);
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
    document.getElementById('p-name').classList.remove('input-error');
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

function openEditProjectModal(proj) {
    modalMode = 'edit';
    activeProjectId = proj.project_id;

    document.getElementById('printer-modal-title').textContent = 'EDIT PROJECT';
    document.getElementById('printer-confirm').textContent = 'Save Changes';
    document.getElementById('printer-remove').style.display = '';

    document.getElementById('p-name').value = proj.project_name;
    document.getElementById('p-name').classList.remove('input-error');
    document.getElementById('p-description').value = proj.description || '';
    document.getElementById('ai-user-prompt').value = '';
    document.getElementById('ai-btn-wrap').classList.remove('generating', 'error', 'ready');
    document.getElementById('ai-generate-btn').classList.remove('error', 'ready');

    pickColour(proj.accent_colour);

    document.getElementById('printer-modal').classList.add('open');
}

// --- Revision Modal ---
let activeRevisionProjectId = null;

function addRevision(projectId) {
    openRevisionModal(projectId);
}

function openRevisionModal(projectId) {
    activeRevisionProjectId = projectId;

    document.getElementById('r-name').value = '';
    document.getElementById('r-name').classList.remove('input-error');
    document.getElementById('r-description').value = '';
    document.getElementById('r-ai-prompt').value = '';
    document.getElementById('r-ai-btn-wrap').classList.remove('generating', 'error', 'ready');
    document.getElementById('r-ai-generate-btn').classList.remove('error', 'ready');

    document.getElementById('revision-modal').classList.add('open');
}

function closeRevisionModal() {
    document.getElementById('revision-modal').classList.remove('open');
    activeRevisionProjectId = null;
}

async function confirmRevisionModal() {
    const name = document.getElementById('r-name').value.trim();
    if (!name) {
        document.getElementById('r-name').focus();
        return;
    }
    const description = document.getElementById('r-description').value.trim();

    // Duplicate name check within this project
    const proj = PROJECTS.find(p => p.project_id === activeRevisionProjectId);
    const nameLower = name.toLowerCase();
    if (proj?.nodes?.some(n => n.node_name.toLowerCase() === nameLower)) {
        const nameEl = document.getElementById('r-name');
        nameEl.classList.add('input-error');
        nameEl.focus();
        showToast('A revision with this name already exists');
        return;
    }

    const api = getApi();
    if (!api) { showToast('API not ready'); return; }
    try {
        const node = await api.CREATE_NODE(activeRevisionProjectId, name, description);
        const proj = PROJECTS.find(p => p.project_id === activeRevisionProjectId);
        if (proj) {
            if (!proj.nodes) proj.nodes = [];
            proj.nodes.push(node);
        }
        renderProjectGrid();
        closeRevisionModal();
    } catch (e) {
        console.error('CREATE_NODE failed:', e);
    }
}

async function generateRevisionWithAI() {
    const prompt = document.getElementById('r-ai-prompt').value.trim();
    if (!prompt) {
        document.getElementById('r-ai-prompt').focus();
        return;
    }

    const btn = document.getElementById('r-ai-generate-btn');
    const wrap = document.getElementById('r-ai-btn-wrap');
    const api = getApi();
    if (!api) { showToast('ERROR: API NOT READY'); return; }

    btn.disabled = true;
    btn.classList.remove('error', 'ready');
    wrap.classList.remove('error', 'ready');
    wrap.classList.add('generating');

    try {
        const result = await api.GENERATE_REVISION_DETAILS(prompt);
        if (result.name) document.getElementById('r-name').value = result.name;
        if (result.description) document.getElementById('r-description').value = result.description;
    } catch (err) {
        const msg = err?.message || err?.toString() || 'Unknown error';
        console.error('AI revision generation failed:', msg);
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
        const hasText = document.getElementById('r-ai-prompt').value.trim().length > 0;
        btn.classList.toggle('ready', hasText && !btn.classList.contains('error'));
        wrap.classList.toggle('ready', hasText && !wrap.classList.contains('error'));
    }
}

// --- Confirm (Add) ---
async function confirmProjectModal() {
    const name = document.getElementById('p-name').value.trim();
    if (!name) {
        document.getElementById('p-name').focus();
        return;
    }

    const description = document.getElementById('p-description').value.trim();

    // Duplicate name check
    const nameLower = name.toLowerCase();
    const duplicate = PROJECTS.some(p =>
        p.project_name.toLowerCase() === nameLower &&
        (modalMode !== 'edit' || p.project_id !== activeProjectId)
    );
    if (duplicate) {
        const nameEl = document.getElementById('p-name');
        nameEl.classList.add('input-error');
        nameEl.focus();
        showToast('A project with this name already exists');
        return;
    }

    const api = getApi();
    if (!api) { showToast('API not ready'); return; }

    if (modalMode === 'edit') {
        try {
            const updated = await api.UPDATE_PROJECT(activeProjectId, {
                project_name: name,
                description,
                accent_colour: selectedAccentColour,
            });
            const idx = PROJECTS.findIndex(p => p.project_id === activeProjectId);
            if (idx !== -1 && updated) PROJECTS[idx] = updated;
            renderProjectGrid();
            closeProjectModal();
        } catch (err) {
            console.error('UPDATE_PROJECT failed:', err);
        }
    } else {
        try {
            const proj = await api.CREATE_PROJECT(name, selectedAccentColour, description);
            PROJECTS.push(proj);
            renderProjectGrid();
            updateStats();
            closeProjectModal();
        } catch (err) {
            console.error('CREATE_PROJECT failed:', err);
        }
    }
}

// --- Remove ---
async function removeProjectFromModal() {
    if (!activeProjectId) return;

    const api = getApi();
    if (!api) return;
    try {
        await api.DELETE_PROJECT(activeProjectId);
        PROJECTS = PROJECTS.filter(p => p.project_id !== activeProjectId);
        renderProjectGrid();
        updateStats();
        closeProjectModal();
    } catch (err) {
        console.error('DELETE_PROJECT failed:', err);
    }
}

// --- Boot ---
async function loadProjects(retries = 5) {
    const api = getApi();
    if (!api) {
        if (retries > 0) setTimeout(() => loadProjects(retries - 1), 250);
        return;
    }
    try {
        PROJECTS = await api.LIST_PROJECTS() || [];
    } catch (e) {
        console.error('LIST_PROJECTS failed:', e);
        PROJECTS = [];
    }
    renderProjectGrid();
    updateStats();
}

if (window.pywebview) {
    loadProjects();
} else {
    window.addEventListener('pywebviewready', () => loadProjects());
    // Fallback: pywebviewready may not propagate into iframes — retry covers this
    setTimeout(() => { if (PROJECTS.length === 0) loadProjects(); }, 500);
}
