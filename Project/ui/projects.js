// --- Project store ---
let PROJECTS = [];

// --- Modal State ---
let modalMode = 'add';
let activeProjectId = null;
let selectedAccentColour = COLOURS[0].hex;

// --- Sidebar state ---
let selPid = null, selNid = null, selSbTab = 'notes', sbMdEdit = false, sbNotes = '';

// --- Connection drag state ---
let connDrag = null;

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
function extractMdTitle(raw) {
    for (const line of (raw || '').split('\n')) {
        const m = line.match(/^# (.+)/);
        if (m) return m[1].trim();
    }
    return '';
}

function extractMdDescription(raw) {
    const lines = (raw || '').split('\n');
    let inSection = false;
    for (const line of lines) {
        if (/^## /.test(line)) { inSection = true; continue; }
        if (inSection) {
            if (/^#/.test(line)) break;
            const s = line.trim();
            if (s) return s;
        }
    }
    return '';
}

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

// --- Layout constants ---
const NW = 160, NODE_H = 78, COL_GAP = 220, ROW_GAP = 110, X0 = 36, Y0 = 28;

// --- Graph-aware layout (3 phases) ---
function layoutNodes(proj) {
    const nodes = proj.nodes || [];
    if (!nodes.length) return;
    const conns = proj.connections || [];
    const ids = nodes.map(n => n.node_id);

    // Phase 1: topological rank (Kahn BFS)
    const outEdges = {}, inDeg = {};
    ids.forEach(id => { outEdges[id] = []; inDeg[id] = 0; });
    conns.forEach(c => {
        if (outEdges[c.from] && inDeg[c.to] !== undefined) {
            outEdges[c.from].push(c.to);
            inDeg[c.to]++;
        }
    });
    const rank = {};
    // Only seed the BFS with nodes that have outgoing edges — truly isolated
    // nodes (no edges at all) get date-based ranks so they spread across columns.
    const queue = ids.filter(id => inDeg[id] === 0 && outEdges[id].length > 0);
    queue.forEach(id => { rank[id] = 0; });
    let qi = 0;
    while (qi < queue.length) {
        const cur = queue[qi++];
        outEdges[cur].forEach(nxt => {
            rank[nxt] = Math.max(rank[nxt] || 0, (rank[cur] || 0) + 1);
            inDeg[nxt]--;
            if (inDeg[nxt] === 0) queue.push(nxt);
        });
    }
    // Isolated / cycle nodes → sequential columns by date, after any BFS ranks
    const maxExistingRank = Object.values(rank).length ? Math.max(...Object.values(rank)) : -1;
    const dateSorted = [...nodes].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    dateSorted.forEach((n, i) => { if (rank[n.node_id] === undefined) rank[n.node_id] = maxExistingRank + 1 + i; });

    // Phase 2: group by rank, barycenter sort within each column
    const cols = {};
    nodes.forEach(n => {
        const r = rank[n.node_id] || 0;
        if (!cols[r]) cols[r] = [];
        cols[r].push(n);
    });
    const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
    colKeys.forEach(ci => cols[ci].sort((a, b) => (a.date || '').localeCompare(b.date || '')));
    for (let sweep = 0; sweep < 3; sweep++) {
        colKeys.forEach(ci => {
            const prev = cols[ci - 1];
            if (!prev) return;
            const rowOf = {};
            prev.forEach((n, i) => { rowOf[n.node_id] = i; });
            cols[ci].forEach(n => {
                const preds = conns.filter(c => c.to === n.node_id)
                    .map(c => rowOf[c.from]).filter(v => v !== undefined);
                n._bary = preds.length ? preds.reduce((s, v) => s + v, 0) / preds.length : 999;
            });
            cols[ci].sort((a, b) => a._bary - b._bary);
        });
    }

    // Initial pixel assignment
    const rankOf = {};
    nodes.forEach(n => { rankOf[n.node_id] = rank[n.node_id] || 0; });
    function assign() {
        colKeys.forEach((ci, ci_) => {
            cols[ci].forEach((n, ri) => { n.x = X0 + ci_ * COL_GAP; n.y = Y0 + ri * ROW_GAP; });
        });
    }
    assign();

    // Phase 3: collision avoidance — push nodes clear of long-skip bezier edges
    function bezXAt(p0,c1,c2,p1,t){ const u=1-t; return u*u*u*p0+3*u*u*t*c1+3*u*t*t*c2+t*t*t*p1; }
    function bezYAt(p0,c1,c2,p1,t){ const u=1-t; return u*u*u*p0+3*u*u*t*c1+3*u*t*t*c2+t*t*t*p1; }
    function edgeYAt(fn, tn, xTarget) {
        const ox=fn.x+NW, oy=fn.y+NODE_H/2, ix=tn.x, iy=tn.y+NODE_H/2;
        if (ix <= ox) return (oy+iy)/2;
        const dx = (ix-ox)*0.55;
        let lo=0, hi=1;
        for (let i=0; i<16; i++) {
            const m=(lo+hi)/2;
            bezXAt(ox, ox+dx, ix-dx, ix, m) < xTarget ? lo=m : hi=m;
        }
        return bezYAt(oy, oy, iy, iy, (lo+hi)/2);
    }
    for (let pass=0; pass<20; pass++) {
        let moved = false;
        conns.forEach(c => {
            const fn=nodes.find(n=>n.node_id===c.from), tn=nodes.find(n=>n.node_id===c.to);
            if (!fn||!tn||Math.abs(rankOf[fn.node_id]-rankOf[tn.node_id])<=1) return;
            const minR=Math.min(rankOf[fn.node_id],rankOf[tn.node_id]);
            const maxR=Math.max(rankOf[fn.node_id],rankOf[tn.node_id]);
            colKeys.forEach((ci, ci_) => {
                if (ci<=minR||ci>=maxR) return;
                const eY = edgeYAt(fn, tn, X0+ci_*COL_GAP+NW/2);
                const col = cols[ci];
                col.forEach(node => {
                    if (node.y-10 < eY+10 && node.y+NODE_H+10 > eY-10) {
                        const idx=col.indexOf(node);
                        for (let k=idx; k<col.length; k++) col[k].y += ROW_GAP;
                        moved=true;
                    }
                });
            });
        });
        if (!moved) break;
    }
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

// Smart bezier routing: goes above/below blocking nodes for long-skip edges
function edgePath(fn, tn, allNodes) {
    const o=outPt(fn), i=inPt(tn);
    const colSpan = (tn.x-(fn.x+NW)) / COL_GAP;
    if (colSpan <= 1.05) {
        const dx=Math.abs(i.x-o.x)*0.55;
        return `M${o.x} ${o.y} C${o.x+dx} ${o.y} ${i.x-dx} ${i.y} ${i.x} ${i.y}`;
    }
    const xLeft=fn.x+NW, xRight=tn.x;
    const blocking = allNodes.filter(n => {
        if (n.node_id===fn.node_id||n.node_id===tn.node_id) return false;
        return (n.x+NW)>xLeft+10 && n.x<xRight-10;
    });
    if (!blocking.length) {
        const dx=Math.abs(i.x-o.x)*0.55;
        return `M${o.x} ${o.y} C${o.x+dx} ${o.y} ${i.x-dx} ${i.y} ${i.x} ${i.y}`;
    }
    const aboveY = Math.min(...blocking.map(n=>n.y)) - 18;
    const belowY = Math.max(...blocking.map(n=>n.y+NODE_H)) + 18;
    const avgY = (o.y+i.y)/2;
    const routeY = Math.abs(avgY-aboveY) <= Math.abs(avgY-belowY) ? aboveY : belowY;
    const hPull = Math.abs(i.x-o.x)*0.35;
    return [
        `M${o.x} ${o.y}`,
        `C${o.x+hPull} ${o.y} ${o.x+hPull} ${routeY} ${(o.x+i.x)/2} ${routeY}`,
        `C${i.x-hPull} ${routeY} ${i.x-hPull} ${i.y} ${i.x} ${i.y}`,
    ].join(' ');
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

    if (inner._connProximity) {
        inner.removeEventListener('mousemove', inner._connProximity);
        inner.removeEventListener('mouseleave', inner._connLeave);
    }
    inner._connProximity = e => {
        const cr = inner.getBoundingClientRect();
        const cx = e.clientX - cr.left, cy = e.clientY - cr.top;
        inner.querySelectorAll('.conn-del-html').forEach(btn => {
            const near = Math.hypot(cx - parseFloat(btn.style.left), cy - parseFloat(btn.style.top)) < 36;
            btn.style.opacity = near ? '1' : '0';
            btn.style.pointerEvents = near ? 'all' : 'none';
        });
    };
    inner._connLeave = () => {
        inner.querySelectorAll('.conn-del-html').forEach(btn => {
            btn.style.opacity = '0'; btn.style.pointerEvents = 'none';
        });
    };
    inner.addEventListener('mousemove', inner._connProximity);
    inner.addEventListener('mouseleave', inner._connLeave);

    (proj.connections || []).forEach(conn => {
        const fn = proj.nodes.find(n => n.node_id === conn.from);
        const tn = proj.nodes.find(n => n.node_id === conn.to);
        if (!fn || !tn || fn.x === undefined) return;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', edgePath(fn, tn, proj.nodes));
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

                // Sync title and description from the saved markdown
                const newTitle = extractMdTitle(sbNotes);
                const newDesc  = extractMdDescription(sbNotes);
                if (newTitle && newTitle !== node.node_name) {
                    node.node_name = newTitle;
                    if (api) await api.UPDATE_NODE(selPid, selNid, { node_name: newTitle }).catch(() => {});
                }
                node.description = newDesc;

                sbMdEdit = false;
                renderProjectGrid(); // re-renders card + sidebar title
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
    const body = document.createElement('div');
    body.className = 'proj-body';
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'proj-canvas-wrap';

    const canvasInner = document.createElement('div');
    canvasInner.className = 'proj-canvas-inner';

    // SVG connection layer — appended first so it renders behind nodes (DOM order)
    const connSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connSvg.classList.add('proj-conn-svg');
    canvasInner.appendChild(connSvg);

    const nodes = proj.nodes || [];
    layoutNodes(proj);
    const sz = projCanvasSize(proj);
    const bodyH = sz.h + 10;
    body.style.maxHeight = proj.collapsed ? '0' : bodyH + 'px';

    if (nodes.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'proj-canvas-empty';
        emptyMsg.textContent = 'No iterations yet';
        canvasInner.appendChild(emptyMsg);
    } else {
        canvasInner.style.width  = sz.w + 'px';
        canvasInner.style.height = sz.h + 'px';
        connSvg.setAttribute('width', sz.w);
        connSvg.setAttribute('height', sz.h);

        nodes.forEach(node => {
            const nodeCard = document.createElement('div');
            nodeCard.className = 'node-card' + (node.node_id === selNid && proj.project_id === selPid ? ' node-card-sel' : '');
            nodeCard.style.position = 'absolute';
            nodeCard.style.left = (node.x || 0) + 'px';
            nodeCard.style.top  = (node.y || 0) + 'px';
            nodeCard.style.height = NODE_H + 'px';
            nodeCard.style.setProperty('--proj-ac', proj.accent_colour);
            nodeCard.dataset.pid = proj.project_id;
            nodeCard.dataset.nid = node.node_id;
            nodeCard.addEventListener('click', e => { e.stopPropagation(); selectNode(proj.project_id, node.node_id); });

            const nameEl = document.createElement('div');
            nameEl.className = 'node-card-name';
            nameEl.textContent = node.node_name;
            nodeCard.appendChild(nameEl);

            if (node.description) {
                const descEl = document.createElement('div');
                descEl.className = 'node-card-desc';
                descEl.textContent = node.description;
                nodeCard.appendChild(descEl);
            }

            // Input socket (left) — visible target during drag
            const inputSocket = document.createElement('div');
            inputSocket.className = 'node-conn-input';
            inputSocket.dataset.pid = proj.project_id;
            inputSocket.dataset.nid = node.node_id;
            nodeCard.appendChild(inputSocket);

            // Output grab handle (right) — drag to connect
            const handle = document.createElement('div');
            handle.className = 'node-conn-handle';
            handle.title = 'Drag to connect';
            handle.addEventListener('mousedown', e => startConnDrag(e, proj, node, connSvg, canvasInner));
            nodeCard.appendChild(handle);

            canvasInner.appendChild(nodeCard);
        });

        renderConnections(proj, connSvg, canvasInner);
    }

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
