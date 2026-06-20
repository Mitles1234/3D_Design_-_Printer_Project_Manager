// --- Project store ---
let PROJECTS = [];

// --- Modal State ---
let modalMode = 'add';
let activeProjectId = null;
let selectedAccentColour = COLOURS[0].hex;

// --- Sidebar state ---
let selPid = null;
let selNid = null;
let selSbTab = 'notes';
let sbMdEdit = false;
let sbNotes = '';

// --- Connection drag state ---
let connDrag = null;

// Stores the hover-listeners for each canvas so they can be removed before re-rendering
const connHoverListeners = new WeakMap();

// --- Build colour popover swatches (runs once on load) ---
function buildColourPopover() {
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
}
buildColourPopover();

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
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function renderMd(raw) {
    if (!raw) return '';
    raw = raw.replace(/^\*\*Date:\*\*.*$/m, '').replace(/\n{3,}/g, '\n\n').trim();
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

// --- API handle ---
// pywebview sets window.pywebview.api once the Python bridge is ready.
function getApi() {
    if (window.pywebview?.api) return window.pywebview.api;
    try {
        if (window.parent !== window) return window.parent.pywebview?.api ?? null;
    } catch (_) {}
    return null;
}

// --- AI Generation ---
async function generateAI({ promptId, btnId, apiMethod, nameId, descId }) {
    const prompt = document.getElementById(promptId).value.trim();
    if (!prompt) { document.getElementById(promptId).focus(); return; }

    const btn = document.getElementById(btnId);
    const api = getApi();
    if (!api) { showToast('ERROR: API NOT READY', true); return; }

    btn.disabled = true;
    try {
        const result = await api[apiMethod](prompt);
        if (result.name)        document.getElementById(nameId).value = result.name;
        if (result.description) document.getElementById(descId).value = result.description;
    } catch (err) {
        showToast('AI failed: ' + (err?.message || 'Unknown error').slice(0, 60), true);
    } finally {
        btn.disabled = false;
    }
}

function generateWithAI() {
    return generateAI({ promptId: 'ai-user-prompt', btnId: 'ai-generate-btn', apiMethod: 'GENERATE_PROJECT_DETAILS', nameId: 'p-name', descId: 'p-description' });
}

// --- Layout constants ---
const NW = 160, NODE_H = 78, COL_GAP = 220, ROW_GAP = 110, X0 = 36, Y0 = 28;

// --- Layout: column = number of ancestors (nodes above), date sorts within column ---
function layoutNodes(proj) {
    const nodes = proj.nodes || [];
    if (!nodes.length) return;
    const conns = proj.connections || [];

    const outEdges = {}, inDeg = {};

    nodes.forEach(n => { outEdges[n.node_id] = []; inDeg[n.node_id] = 0; });
    
    conns.forEach(c => {
        if (outEdges[c.from] !== undefined && inDeg[c.to] !== undefined) {
            outEdges[c.from].push(c.to);
            inDeg[c.to]++;
        }
    });

    // Assign each node a column = length of the longest chain leading to it.
    // Start from root nodes (nothing points to them), then walk outward.
    const col = {};
    const queue = nodes.filter(n => inDeg[n.node_id] === 0).map(n => n.node_id);
    queue.forEach(id => { col[id] = 0; });
    while (queue.length > 0) {
        const cur = queue.shift();
        outEdges[cur].forEach(nxt => {
            col[nxt] = Math.max(col[nxt] || 0, col[cur] + 1);
            inDeg[nxt]--;
            if (inDeg[nxt] === 0) queue.push(nxt);
        });
    }

    // Isolated nodes (no edges) get columns after all connected ones, ordered by date
    const assignedCols = Object.values(col);
    const maxCol = assignedCols.length > 0 ? Math.max(...assignedCols) : -1;
    [...nodes]
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .forEach((n, i) => { if (col[n.node_id] === undefined) col[n.node_id] = maxCol + 1 + i; });

    // Group by column, sort within each by date
    const cols = {};
    nodes.forEach(n => {
        const c = col[n.node_id];
        if (!cols[c]) cols[c] = [];
        cols[c].push(n);
    });
    Object.values(cols).forEach(c => c.sort((a, b) => (a.date || '').localeCompare(b.date || '')));

    const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
    colKeys.forEach((c, ci) => {
        cols[c].forEach((n, ri) => { n.x = X0 + ci * COL_GAP; n.y = Y0 + ri * ROW_GAP; });
    });
}

function projCanvasSize(proj) {
    const nodes = proj.nodes || [];
    if (!nodes.length) return { w: 400, h: 140 };
    return {
        w: Math.max(...nodes.map(n => (n.x||0))) + NW + X0,
        h: Math.max(...nodes.map(n => (n.y||0))) + NODE_H + Y0,
    };
}

// --- Edge geometry helpers ---
function outPt(n) { return { x: n.x + NW, y: n.y + NODE_H/2 }; }
function inPt(n)  { return { x: n.x,      y: n.y + NODE_H/2 }; }
function midPt(f, t) { const o=outPt(f),i=inPt(t); return { x:(o.x+i.x)/2, y:(o.y+i.y)/2 }; }

// Simple S-curve bezier — control points pulled horizontally from each end
function edgePath(fn, tn) {
    const o = outPt(fn), i = inPt(tn);
    const dx = Math.max(Math.abs(i.x - o.x) * 0.45, 60);
    return `M${o.x} ${o.y} C${o.x+dx} ${o.y} ${i.x-dx} ${i.y} ${i.x} ${i.y}`;
}

// Re-layout and refresh a canvas in-place (after connection add/remove)
function refreshCanvas(proj, svg, inner) {
    layoutNodes(proj);
    const sz = projCanvasSize(proj);
    inner.style.width  = sz.w + 'px';
    inner.style.height = sz.h + 'px';
    svg.setAttribute('width', sz.w);
    svg.setAttribute('height', sz.h);
    // Propagate new height up to the body so the card expands/shrinks
    const wrap = inner.parentElement;
    const body = wrap?.parentElement;
    if (body) body.style.maxHeight = (sz.h + 10) + 'px';
    proj.nodes.forEach(node => {
        const el = inner.querySelector(`[data-nid="${node.node_id}"]`);
        if (el) { el.style.left = node.x+'px'; el.style.top = node.y+'px'; }
    });
    renderConnections(proj, svg, inner);
}

// --- Connection graph ---

function renderConnections(proj, svg, inner) {
    inner.querySelectorAll('.conn-del-html').forEach(el => el.remove());
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Remove old hover listeners before adding new ones (connections change on re-render)
    const existing = connHoverListeners.get(inner);
    if (existing) {
        inner.removeEventListener('mousemove', existing.onMove);
        inner.removeEventListener('mouseleave', existing.onLeave);
    }

    const onMove = e => {
        const cr = inner.getBoundingClientRect();
        const cx = e.clientX - cr.left, cy = e.clientY - cr.top;
        inner.querySelectorAll('.conn-del-html').forEach(btn => {
            const near = Math.hypot(cx - parseFloat(btn.style.left), cy - parseFloat(btn.style.top)) < 36;
            btn.style.opacity = near ? '1' : '0';
            btn.style.pointerEvents = near ? 'all' : 'none';
        });
    };

    const onLeave = () => {
        inner.querySelectorAll('.conn-del-html').forEach(btn => {
            btn.style.opacity = '0';
            btn.style.pointerEvents = 'none';
        });
    };

    connHoverListeners.set(inner, { onMove, onLeave });
    inner.addEventListener('mousemove', onMove);
    inner.addEventListener('mouseleave', onLeave);

    (proj.connections || []).forEach(conn => {
        const fn = proj.nodes.find(n => n.node_id === conn.from);
        const tn = proj.nodes.find(n => n.node_id === conn.to);
        if (!fn || !tn || fn.x === undefined) return;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', edgePath(fn, tn));
        path.classList.add('conn-path');
        path.style.stroke = proj.accent_colour;
        svg.appendChild(path);

        const mid = midPt(fn, tn);
        const delBtn = document.createElement('button');
        delBtn.className = 'conn-del-html';
        delBtn.title = 'Delete connection';
        delBtn.innerHTML = `<i class="ti ti-x" style="font-size:9px;line-height:1"></i>`;
        delBtn.style.left = `${mid.x}px`;
        delBtn.style.top  = `${mid.y}px`;
        delBtn.addEventListener('click', async e => {
            e.stopPropagation();
            const api = getApi();
            if (!api) return;
            try {
                await api.DELETE_CONNECTION(proj.project_id, { from: conn.from, to: conn.to });
                proj.connections = (proj.connections||[]).filter(
                    c => !(c.from===conn.from && c.to===conn.to)
                );
                refreshCanvas(proj, svg, inner);
            } catch (err) { console.error('DELETE_CONNECTION failed:', err); }
        });
        inner.appendChild(delBtn);
    });
}

function startConnDrag(e, proj, node, svg, inner) {
    // stopPropagation prevents the click from also triggering the node-select handler on the parent
    e.stopPropagation();
    e.preventDefault();

    const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    preview.classList.add('conn-path', 'conn-preview');
    preview.style.stroke = proj.accent_colour;

    const endDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    endDot.setAttribute('r', '5');
    endDot.classList.add('conn-end-dot');
    endDot.style.fill = proj.accent_colour;
    endDot.style.stroke = 'var(--surface)';
    endDot.style.strokeWidth = '2';

    svg.appendChild(preview);
    svg.appendChild(endDot);

    document.body.classList.add('conn-dragging');
    connDrag = { proj, fromNode: node, nodeId: node.node_id, svg, inner, preview, endDot };
    document.addEventListener('mousemove', onConnMove);
    document.addEventListener('mouseup', onConnEnd);
}

function onConnMove(e) {
    if (!connDrag) return;
    const { fromNode, inner, preview, endDot } = connDrag;
    const cr = inner.getBoundingClientRect();
    const ox = fromNode.x + NW, oy = fromNode.y + NODE_H / 2;
    const x2 = e.clientX - cr.left, y2 = e.clientY - cr.top;
    const dx = Math.max(Math.abs(x2 - ox) * 0.5, 50);
    preview.setAttribute('d', `M ${ox} ${oy} C ${ox+dx} ${oy} ${x2-dx} ${y2} ${x2} ${y2}`);
    endDot.setAttribute('cx', x2);
    endDot.setAttribute('cy', y2);
}

async function onConnEnd(e) {
    document.removeEventListener('mousemove', onConnMove);
    document.removeEventListener('mouseup', onConnEnd);
    document.body.classList.remove('conn-dragging');
    if (!connDrag) return;
    const { proj, nodeId, svg, inner, preview, endDot } = connDrag;
    preview.remove();
    endDot.remove();
    connDrag = null;

    const target = e.target.closest('[data-nid]');
    if (!target) return;
    const toNid = target.dataset.nid;
    const toPid = target.dataset.pid;
    if (toNid === nodeId || toPid !== proj.project_id) return;
    if ((proj.connections || []).some(c => c.from === nodeId && c.to === toNid)) return;

    const api = getApi();
    if (!api) return;
    try {
        const conn = await api.CREATE_CONNECTION(proj.project_id, nodeId, toNid);
        if (conn) {
            proj.connections = proj.connections || [];
            proj.connections.push(conn);
            refreshCanvas(proj, svg, inner);
        }
    } catch (err) { console.error('CREATE_CONNECTION failed:', err); }
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

function buildNotesPanel(panel, node) {
    if (sbMdEdit) {
        panel.innerHTML = `<div class="md-wrap"><textarea class="sb-ta"></textarea><button class="md-fab" title="Save notes"><i class="ti ti-check"></i></button></div>`;
        const ta = panel.querySelector('.sb-ta');
        ta.value = sbNotes;
        ta.addEventListener('input', () => { sbNotes = ta.value; });
        setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 20);
        panel.querySelector('.md-fab').addEventListener('click', async () => {
            const api = getApi();
            if (!api) return;
            // Python parses the markdown, validates the date, updates the node, and returns it.
            // If the date line has an invalid value it returns null — show an error and stop.
            const updated = await api.SET_NODE_NOTES(selPid, selNid, sbNotes).catch(() => null);
            if (!updated) {
                const fab = panel.querySelector('.md-fab');
                fab.classList.add('error');
                setTimeout(() => fab.classList.remove('error'), 1500);
                return;
            }
            node.node_name   = updated.node_name;
            node.description = updated.description || '';
            node.date        = updated.date;
            const proj = PROJECTS.find(p => p.project_id === selPid);
            if (proj) proj.nodes.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            sbMdEdit = false;
            renderProjectGrid();
        });
    } else {
        const html = renderMd(sbNotes);
        panel.innerHTML = `<div class="md-wrap"><div class="md-preview">${html || '<p class="md-empty">No notes yet — click edit to add some.</p>'}</div><button class="md-fab" title="Edit notes"><i class="ti ti-pencil"></i></button></div>`;
        panel.querySelector('.md-fab').addEventListener('click', () => {
            if (node.date && !/^\*\*Date:\*\*/m.test(sbNotes)) {
                sbNotes = /^# .+/m.test(sbNotes)
                    ? sbNotes.replace(/^(# .+)$/m, `$1\n**Date:** ${node.date}`)
                    : `**Date:** ${node.date}\n\n${sbNotes}`.trimEnd();
            }
            sbMdEdit = true;
            renderSidebar();
        });
    }
}

function buildFilesPanel(panel, node) {
    const files = node.files || [];
    panel.innerHTML = files.length
        ? `<div>${files.map(f => `<span class="sb-file-chip">${f}</span>`).join('')}</div>`
        : `<span style="font-size:12px;color:var(--text-faint);font-style:italic">No files attached yet</span>`;
    const addBtn = document.createElement('button');
    addBtn.className = 'sb-add';
    addBtn.innerHTML = `<i class="ti ti-paperclip" style="font-size:12px"></i> Attach files`;
    panel.appendChild(addBtn);
}

function buildDetailsPanel(panel, proj, node) {
    panel.innerHTML = `
        <div class="sb-dr"><span class="sb-dk">Project</span><span class="sb-dv">${proj.project_name}</span></div>
        <div class="sb-dr"><span class="sb-dk">Date</span><span class="sb-dv">${fmtDate(node.date)}</span></div>
        <div class="sb-dr"><span class="sb-dk">Description</span><span class="sb-dv">${node.description || '—'}</span></div>
        <button class="sb-del-btn"><i class="ti ti-trash" style="font-size:12px"></i> Delete revision</button>`;
    panel.querySelector('.sb-del-btn').addEventListener('click', async () => {
        const api = getApi();
        if (!api) return;
        try {
            await api.DELETE_NODE(selPid, selNid);
            const p = PROJECTS.find(pr => pr.project_id === selPid);
            if (p) {
                p.nodes       = p.nodes.filter(n => n.node_id !== selNid);
                p.connections = p.connections.filter(c => c.from !== selNid && c.to !== selNid);
            }
            selPid = null; selNid = null;
            renderProjectGrid();
            updateStats();
        } catch (e) { console.error('DELETE_NODE failed:', e); }
    });
}

function renderSidebar() {
    const sb = document.getElementById('proj-sidebar');
    if (!sb) return;

    if (!selPid || !selNid) {
        sb.innerHTML = `<div class="sb-empty"><i class="ti ti-hand-click" style="font-size:26px"></i><span>Click any Revision<br>to View its Details</span></div>`;
        return;
    }

    const proj = PROJECTS.find(p => p.project_id === selPid);
    const node = proj?.nodes?.find(n => n.node_id === selNid);
    if (!proj || !node) { selPid = null; selNid = null; renderSidebar(); return; }

    const tabsHtml = ['notes', 'files', 'details'].map(t =>
        `<button class="sb-tab${selSbTab === t ? ' on' : ''}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`
    ).join('');

    sb.innerHTML = `
        <div class="sb-wrap" style="--sb-ac:${proj.accent_colour}">
            <div class="sb-hdr">
                <div class="sb-name">${node.node_name}</div>
                <div class="sb-proj-label">${proj.project_name}</div>
                <div class="sb-date-row"><span class="sb-date-pill"><i class="ti ti-calendar" style="font-size:10px"></i> ${fmtDate(node.date)}</span></div>
            </div>
            <div class="sb-tabs">${tabsHtml}</div>
            <div class="sb-panel"></div>
        </div>`;

    sb.querySelectorAll('.sb-tab').forEach(btn =>
        btn.addEventListener('click', () => { selSbTab = btn.dataset.tab; sbMdEdit = false; renderSidebar(); })
    );

    const panel = sb.querySelector('.sb-panel');
    if (selSbTab === 'notes')        buildNotesPanel(panel, node);
    else if (selSbTab === 'files')   buildFilesPanel(panel, node);
    else                             buildDetailsPanel(panel, proj, node);
}

// --- Project grid ---
function renderProjectGrid() {
    const grid = document.getElementById('printers-grid');
    grid.innerHTML = '';
    PROJECTS.forEach(proj => grid.appendChild(buildProjectCard(proj)));
    renderSidebar();
}

function buildProjectHeader(proj) {
    const hdr = document.createElement('div');
    hdr.className = 'proj-hdr';
    hdr.innerHTML = `
        <div class="proj-arrow" style="color:${proj.accent_colour}">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,6 8,10 12,6"/></svg>
        </div>
        <div class="proj-info">
            <div class="proj-name">${proj.project_name}</div>
            ${proj.description ? `<div class="proj-sub">${proj.description}</div>` : ''}
        </div>
        <div class="proj-hdr-actions">
            <button class="btn-sm"><i class="ti ti-plus" aria-hidden="true"></i> Revision</button>
            <button class="icon-button" title="Edit project"><i class="ti ti-pencil" aria-hidden="true"></i></button>
        </div>`;
    hdr.querySelector('.btn-sm').addEventListener('click', e => { e.stopPropagation(); openRevisionModal(proj.project_id); });
    hdr.querySelector('.icon-button').addEventListener('click', e => { e.stopPropagation(); openProjectModal(proj); });
    return hdr;
}

function buildNodeElement(proj, node, connSvg, canvasInner) {
    const el = document.createElement('div');
    el.className = 'node-card' + (node.node_id === selNid && proj.project_id === selPid ? ' node-card-sel' : '');
    el.style.cssText = `position:absolute;left:${node.x||0}px;top:${node.y||0}px;height:${NODE_H}px`;
    el.style.setProperty('--proj-ac', proj.accent_colour);
    el.dataset.pid = proj.project_id;
    el.dataset.nid = node.node_id;
    el.innerHTML = `
        <div class="node-card-name">${node.node_name}</div>
        ${node.description ? `<div class="node-card-desc">${node.description}</div>` : ''}
        <div class="node-conn-input" data-pid="${proj.project_id}" data-nid="${node.node_id}"></div>
        <div class="node-conn-handle" title="Drag to Connect"></div>`;
    el.addEventListener('click', e => { e.stopPropagation(); selectNode(proj.project_id, node.node_id); });
    el.querySelector('.node-conn-handle').addEventListener('mousedown', e => startConnDrag(e, proj, node, connSvg, canvasInner));
    return el;
}

function buildProjectCard(proj) {
    const card = document.createElement('div');
    card.className = 'proj-card' + (proj.collapsed ? ' collapsed' : '');
    card.dataset.id = proj.project_id;
    card.style.setProperty('--proj-ac', proj.accent_colour);

    const hdr  = buildProjectHeader(proj);
    const body = document.createElement('div');
    body.className = 'proj-body';

    const canvasInner = document.createElement('div');
    canvasInner.className = 'proj-canvas-inner';

    // SVG layer appended first so it renders behind the node cards
    const connSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connSvg.classList.add('proj-conn-svg');
    canvasInner.appendChild(connSvg);

    const nodes = proj.nodes || [];
    layoutNodes(proj);
    const sz = projCanvasSize(proj);
    body.style.maxHeight = proj.collapsed ? '0' : (sz.h + 10) + 'px';

    if (nodes.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'proj-canvas-empty';
        emptyMsg.textContent = 'No iterations yet';
        canvasInner.appendChild(emptyMsg);
    } else {
        canvasInner.style.width  = sz.w + 'px';
        canvasInner.style.height = sz.h + 'px';
        connSvg.setAttribute('width',  sz.w);
        connSvg.setAttribute('height', sz.h);
        nodes.forEach(node => canvasInner.appendChild(buildNodeElement(proj, node, connSvg, canvasInner)));
        renderConnections(proj, connSvg, canvasInner);
    }

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'proj-canvas-wrap';
    canvasWrap.appendChild(canvasInner);
    body.appendChild(canvasWrap);

    hdr.addEventListener('click', () => {
        proj.collapsed = !proj.collapsed;
        card.classList.toggle('collapsed', proj.collapsed);
        if (proj.collapsed) {
            body.style.maxHeight = '0';
        } else {
            layoutNodes(proj);
            body.style.maxHeight = (projCanvasSize(proj).h + 10) + 'px';
        }
        const api = getApi();
        if (api) api.UPDATE_PROJECT(proj.project_id, { collapsed: proj.collapsed }).catch(() => {});
    });

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
// Pass a proj object to open in edit mode, nothing to open in add mode
function openProjectModal(proj = null) {
    modalMode       = proj ? 'edit' : 'add';
    activeProjectId = proj?.project_id ?? null;

    document.getElementById('printer-modal-title').textContent = proj ? 'EDIT PROJECT' : 'NEW PROJECT';
    document.getElementById('printer-confirm').textContent     = proj ? 'Save Changes'  : 'Add Project';
    document.getElementById('printer-remove').style.display   = proj ? ''      : 'none';

    document.getElementById('p-name').value = proj?.project_name ?? '';
    document.getElementById('p-name').classList.remove('input-error');
    document.getElementById('p-description').value = proj?.description ?? '';
    document.getElementById('ai-user-prompt').value = '';
    document.getElementById('ai-btn-wrap').classList.remove('generating', 'error', 'ready');
    document.getElementById('ai-generate-btn').classList.remove('error', 'ready');

    pickColour(proj?.accent_colour ?? COLOURS[0].hex);
    document.getElementById('printer-modal').classList.add('open');
}

function closeProjectModal() {
    closeColourPicker();
    document.getElementById('printer-modal').classList.remove('open');
}

// --- Revision Modal ---
let activeRevisionProjectId = null;

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
    const proj = PROJECTS.find(p => p.project_id === activeRevisionProjectId);
    const existingNames = (proj?.nodes || []).map(n => n.node_name.toLowerCase());
    const name = validateUniqueName('r-name', existingNames, 'A revision with this name already exists');
    if (!name) return;

    const description = document.getElementById('r-description').value.trim();
    const api = getApi();
    if (!api) { showToast('API not ready', true); return; }
    try {
        const node = await api.CREATE_NODE(activeRevisionProjectId, name, description);
        if (proj) {
            if (!proj.nodes) proj.nodes = [];
            proj.nodes.push(node);
        }
        renderProjectGrid();
        closeRevisionModal();
    } catch (e) { console.error('CREATE_NODE failed:', e); }
}

function generateRevisionWithAI() {
    return generateAI({ promptId: 'r-ai-prompt', btnId: 'r-ai-generate-btn', apiMethod: 'GENERATE_REVISION_DETAILS', nameId: 'r-name', descId: 'r-description' });
}

// Returns the trimmed name if valid and unique, otherwise shows the error and returns null
function validateUniqueName(inputId, existingNames, toastMsg) {
    const el = document.getElementById(inputId);
    const name = el.value.trim();
    if (!name) { el.focus(); return null; }
    if (existingNames.includes(name.toLowerCase())) {
        el.classList.add('input-error');
        el.focus();
        showToast(toastMsg, true);
        return null;
    }
    return name;
}

// --- Confirm (Add / Edit) ---
async function confirmProjectModal() {
    const existingNames = PROJECTS
        .filter(p => modalMode !== 'edit' || p.project_id !== activeProjectId)
        .map(p => p.project_name.toLowerCase());
    const name = validateUniqueName('p-name', existingNames, 'A project with this name already exists');
    if (!name) return;

    const description = document.getElementById('p-description').value.trim();
    const api = getApi();
    if (!api) { showToast('API not ready', true); return; }

    if (modalMode === 'edit') {
        try {
            const updated = await api.UPDATE_PROJECT(activeProjectId, { project_name: name, description, accent_colour: selectedAccentColour });
            const idx = PROJECTS.findIndex(p => p.project_id === activeProjectId);
            if (idx !== -1 && updated) PROJECTS[idx] = updated;
            renderProjectGrid();
            closeProjectModal();
        } catch (err) { console.error('UPDATE_PROJECT failed:', err); }
    } else {
        try {
            const proj = await api.CREATE_PROJECT(name, selectedAccentColour, description);
            PROJECTS.push(proj);
            renderProjectGrid();
            updateStats();
            closeProjectModal();
        } catch (err) { console.error('CREATE_PROJECT failed:', err); }
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
async function loadProjects() {
    // pywebview sets up the API bridge asynchronously — retry a few times before giving up
    let api = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        api = getApi();
        if (api) break;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!api) return;

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
