// --- Project store ---
let PROJECTS = [];

// --- Modal State ---
let modalMode = 'add';
let activeProjectId = null;
let selectedAccentColour = COLOURS[0].hex;

// --- Sidebar state ---
let selPid = null, selNid = null, selSbTab = 'notes', sbMdEdit = false, sbNotes = '';

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

// --- Helpers ---
function fmtDate(iso) {
    if (!iso) return 'No date';
    const parts = iso.split('-');
    if (parts.length < 3) return iso;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(parts[2])} ${months[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

function renderMd(raw) {
    if (!raw) return '';
    return raw
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/^---$/gm, '<hr>')
        .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
        .replace(/^(?!<[hul\d]|<hr)(.+)$/gm, '<p>$1</p>');
}

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

// --- Date picker ---
function openDatePicker(anchor, currentDateStr, onPick) {
    document.getElementById('_dp')?.remove();

    const parsed = currentDateStr ? new Date(currentDateStr + 'T00:00:00') : new Date();
    let viewYear = parsed.getFullYear();
    let viewMonth = parsed.getMonth();

    const dp = document.createElement('div');
    dp.id = '_dp';
    dp.className = 'dp-popover';

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    function build() {
        dp.innerHTML = '';

        const hdr = document.createElement('div');
        hdr.className = 'dp-hdr';

        const prev = document.createElement('button');
        prev.className = 'dp-nav';
        prev.innerHTML = '<i class="ti ti-chevron-left"></i>';
        prev.addEventListener('click', e => { e.stopPropagation(); viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } build(); });

        const title = document.createElement('span');
        title.className = 'dp-title';
        title.textContent = `${MONTHS[viewMonth]} ${viewYear}`;

        const next = document.createElement('button');
        next.className = 'dp-nav';
        next.innerHTML = '<i class="ti ti-chevron-right"></i>';
        next.addEventListener('click', e => { e.stopPropagation(); viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } build(); });

        hdr.append(prev, title, next);
        dp.appendChild(hdr);

        const dayRow = document.createElement('div');
        dayRow.className = 'dp-day-labels';
        ['Mo','Tu','We','Th','Fr','Sa','Su'].forEach(d => {
            const s = document.createElement('span');
            s.textContent = d;
            dayRow.appendChild(s);
        });
        dp.appendChild(dayRow);

        const grid = document.createElement('div');
        grid.className = 'dp-grid';

        const firstDay = new Date(viewYear, viewMonth, 1).getDay();
        const offset = firstDay === 0 ? 6 : firstDay - 1;
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        for (let i = 0; i < offset; i++) {
            grid.appendChild(document.createElement('span'));
        }

        const today = new Date();
        const sel = currentDateStr ? new Date(currentDateStr + 'T00:00:00') : null;

        for (let d = 1; d <= daysInMonth; d++) {
            const btn = document.createElement('button');
            btn.className = 'dp-day';
            btn.textContent = d;
            const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;
            const isSel   = sel && sel.getFullYear() === viewYear && sel.getMonth() === viewMonth && sel.getDate() === d;
            if (isToday) btn.classList.add('dp-today');
            if (isSel)   btn.classList.add('dp-sel');
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                onPick(iso);
                dp.remove();
            });
            grid.appendChild(btn);
        }
        dp.appendChild(grid);

        // Position
        const r = anchor.getBoundingClientRect();
        dp.style.top  = `${r.bottom + 6}px`;
        dp.style.left = `${Math.min(r.left, window.innerWidth - 230)}px`;
    }

    build();
    document.body.appendChild(dp);

    const close = e => {
        if (!dp.contains(e.target) && e.target !== anchor) {
            dp.remove();
            document.removeEventListener('mousedown', close);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
}

// --- Sidebar ---
async function selectNode(projectId, nodeId) {
    if (selPid === projectId && selNid === nodeId) {
        selPid = null; selNid = null; sbNotes = ''; sbMdEdit = false;
    } else {
        selPid = projectId; selNid = nodeId;
        selSbTab = 'notes'; sbMdEdit = false; sbNotes = '';
        const api = getApi();
        if (api) {
            try { sbNotes = (await api.GET_NODE_NOTES(projectId, nodeId)) || ''; }
            catch (_) { sbNotes = ''; }
        }
    }
    document.querySelectorAll('.node-card').forEach(c => {
        c.classList.toggle('node-card-sel', c.dataset.pid === selPid && c.dataset.nid === selNid);
    });
    renderSidebar();
}

function renderSidebar() {
    const sb = document.getElementById('proj-sidebar');
    if (!sb) return;

    if (!selPid || !selNid) {
        sb.innerHTML = `<div class="sb-empty"><i class="ti ti-hand-click" style="font-size:26px"></i><span>Click any revision<br>to view its details</span></div>`;
        return;
    }

    const proj = PROJECTS.find(p => p.project_id === selPid);
    const node = proj?.nodes?.find(n => n.node_id === selNid);
    if (!proj || !node) { selPid = null; selNid = null; renderSidebar(); return; }

    const wrap = document.createElement('div'); 
    wrap.className = 'sb-wrap';
    wrap.style.setProperty('--sb-ac', proj.accent_colour);

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'sb-hdr';
    hdr.innerHTML = `
        <div class="sb-name">${node.node_name}</div>
        <div class="sb-proj-label">${proj.project_name}</div>
        <div class="sb-date-row"></div>`;

    const dateBtn = document.createElement('button');
    dateBtn.className = 'sb-date-pill';
    dateBtn.innerHTML = `<i class="ti ti-calendar" style="font-size:10px"></i> ${fmtDate(node.date)}`;
    dateBtn.addEventListener('click', e => {
        e.stopPropagation();
        openDatePicker(dateBtn, node.date, async iso => {
            const api = getApi();
            if (api) {
                try { await api.UPDATE_NODE(selPid, selNid, { date: iso }); }
                catch (err) { console.error('UPDATE_NODE date failed:', err); return; }
            }
            node.date = iso;
            const proj = PROJECTS.find(p => p.project_id === selPid);
            if (proj) proj.nodes.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            renderProjectGrid();
        });
    });
    hdr.querySelector('.sb-date-row').appendChild(dateBtn);
    wrap.appendChild(hdr);

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'sb-tabs';
    ['notes', 'files', 'details'].forEach(t => {
        const btn = document.createElement('button');
        btn.className = 'sb-tab' + (selSbTab === t ? ' on' : '');
        btn.textContent = t.charAt(0).toUpperCase() + t.slice(1);
        btn.addEventListener('click', () => { selSbTab = t; sbMdEdit = false; renderSidebar(); });
        tabs.appendChild(btn);
    });
    wrap.appendChild(tabs);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'sb-panel';

    if (selSbTab === 'notes') {
        const mdWrap = document.createElement('div');
        mdWrap.className = 'md-wrap';

        if (sbMdEdit) {
            const ta = document.createElement('textarea');
            ta.className = 'sb-ta';
            ta.value = sbNotes;
            ta.addEventListener('input', () => { sbNotes = ta.value; });
            mdWrap.appendChild(ta);
            setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 20);

            const fab = document.createElement('button');
            fab.className = 'md-fab';
            fab.title = 'Save notes';
            fab.innerHTML = `<i class="ti ti-check"></i>`;
            fab.addEventListener('click', async () => {
                const api = getApi();
                if (api) await api.SET_NODE_NOTES(selPid, selNid, sbNotes).catch(() => {});
                sbMdEdit = false;
                renderSidebar();
            });
            mdWrap.appendChild(fab);
        } else {
            const preview = document.createElement('div');
            preview.className = 'md-preview';
            const html = renderMd(sbNotes);
            preview.innerHTML = html || '<p class="md-empty">No notes yet — click edit to add some.</p>';
            mdWrap.appendChild(preview);

            const fab = document.createElement('button');
            fab.className = 'md-fab';
            fab.title = 'Edit notes';
            fab.innerHTML = `<i class="ti ti-pencil"></i>`;
            fab.addEventListener('click', () => { sbMdEdit = true; renderSidebar(); });
            mdWrap.appendChild(fab);
        }
        panel.appendChild(mdWrap);

    } else if (selSbTab === 'files') {
        const files = node.files || [];
        if (files.length) {
            const chipsWrap = document.createElement('div');
            files.forEach(f => {
                const chip = document.createElement('span');
                chip.className = 'sb-file-chip';
                chip.textContent = f;
                chipsWrap.appendChild(chip);
            });
            panel.appendChild(chipsWrap);
        } else {
            const empty = document.createElement('span');
            empty.style.cssText = 'font-size:12px;color:var(--text-faint);font-style:italic';
            empty.textContent = 'No files attached yet';
            panel.appendChild(empty);
        }
        const addBtn = document.createElement('button');
        addBtn.className = 'sb-add';
        addBtn.innerHTML = `<i class="ti ti-paperclip" style="font-size:12px"></i> Attach files`;
        panel.appendChild(addBtn);

    } else {
        // Details tab
        const rows = [
            ['Project', proj.project_name],
            ['Date', fmtDate(node.date)],
            ['Description', node.description || '—'],
        ];
        rows.forEach(([k, v]) => {
            const row = document.createElement('div');
            row.className = 'sb-dr';
            row.innerHTML = `<span class="sb-dk">${k}</span><span class="sb-dv">${v}</span>`;
            panel.appendChild(row);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'sb-del-btn';
        delBtn.innerHTML = `<i class="ti ti-trash" style="font-size:12px"></i> Delete revision`;
        delBtn.addEventListener('click', async () => {
            const api = getApi();
            if (!api) return;
            try {
                await api.DELETE_NODE(selPid, selNid);
                const p = PROJECTS.find(pr => pr.project_id === selPid);
                if (p) {
                    p.nodes = (p.nodes || []).filter(n => n.node_id !== selNid);
                    p.connections = (p.connections || []).filter(c => c.from !== selNid && c.to !== selNid);
                }
                selPid = null; selNid = null;
                renderProjectGrid();
                updateStats();
            } catch (e) { console.error('DELETE_NODE failed:', e); }
        });
        panel.appendChild(delBtn);
    }

    wrap.appendChild(panel);
    sb.innerHTML = '';
    sb.appendChild(wrap);
}

// --- Project grid ---
function renderProjectGrid() {
    const grid = document.getElementById('printers-grid');
    grid.innerHTML = '';
    PROJECTS.forEach(proj => grid.appendChild(buildProjectCard(proj)));
    renderSidebar();
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
            card.className = 'node-card' + (node.node_id === selNid && proj.project_id === selPid ? ' node-card-sel' : '');
            card.style.setProperty('--proj-ac', proj.accent_colour);
            card.dataset.pid = proj.project_id;
            card.dataset.nid = node.node_id;
            card.addEventListener('click', e => { e.stopPropagation(); selectNode(proj.project_id, node.node_id); });

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

async function updateStats() {
    const api = getApi();
    if (!api) return;
    try {
        const stats = await api.GET_PROJECT_STATS();
        document.getElementById('stat-projects').textContent = stats.projects ?? 0;
        document.getElementById('stat-itterations').textContent = stats.iterations ?? 0;
        document.getElementById('stat-files').textContent = stats.files ?? 0;
    } catch (e) {
        console.error('GET_PROJECT_STATS failed:', e);
    }
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

renderSidebar();

if (window.pywebview) {
    loadProjects();
} else {
    window.addEventListener('pywebviewready', () => loadProjects());
    // Fallback: pywebviewready may not propagate into iframes — retry covers this
    setTimeout(() => { if (PROJECTS.length === 0) loadProjects(); }, 500);
}
