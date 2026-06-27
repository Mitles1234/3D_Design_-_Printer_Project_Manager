
const DEFAULT_DIAMETER = 1.75;
const CUSTOM_MATERIAL_VALUE = '__custom__';
const TRANSPARENT_DRAG_IMAGE = new Image();
TRANSPARENT_DRAG_IMAGE.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

let printers = [];
let filaments = [];
let dragData = null;
let selectedColor = COLOURS[0].hex;
let activeFilter = 'ALL';
let printerSearch = '';
let activeFilamentId = null;
let activePrinterId = null;

// --- API handle (same pattern as projects.js) ---
function getApi() {
    if (window.pywebview?.api) return window.pywebview.api;
    try {
        if (window.parent !== window) return window.parent.pywebview?.api ?? null;
    } catch (_) {}
    return null;
}

async function loadData() {
    let api = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        api = getApi();
        if (api) break;
        await new Promise(r => setTimeout(r, 250));
    }
    if (!api) return;

    try {
        const [printerData, filamentData] = await Promise.all([
            api.LIST_PRINTERS(false),
            api.LIST_FILAMENTS(),
        ]);

        printers = (printerData || []).map((printer) => ({
            id: printer.printer_id,
            name: printer.name || 'Unnamed Printer',
            model: printer.model || 'Unknown model',
            status: 'offline',
            statusLabel: 'OFFLINE',
            hotend: { c: null, t: null },
            bed: { c: null, t: null },
            filament_ids: Array.isArray(printer.filament_ids) ? printer.filament_ids : [],
            IP_address: printer.IP_address || '',
            frontend_port: printer.frontend_port || '',
            backend_port: printer.backend_port || 7125,
        }));

        filaments = (filamentData || []).map((filament) => ({
            id: filament.filament_id,
            name: filament.name || 'Untitled Spool',
            material: filament.material || 'PLA',
            color: filament.color || '#94a3b8',
            weight: filament.weight || 0,
            diameter: filament.diameter || DEFAULT_DIAMETER,
            printerId: null,
        }));

        const filamentMap = new Map(filaments.map((f) => [f.id, f]));
        printers.forEach((printer) => {
            printer.filament_ids.forEach((fid) => {
                const f = filamentMap.get(fid);
                if (f) f.printerId = printer.id;
            });
        });

        renderAll();

        printers.forEach(printer => {
            checkPrinterStatus(printer).then(info => {
                const p = printers.find(p => p.id === printer.id);
                if (p) { p.status = info.status; p.statusLabel = info.label; p.hotend = info.hotend; p.bed = info.bed; }
                updatePrinterCardStatus(printer.id, info);
            });
        });
    } catch (error) {
        showToast(error.message || 'Failed to load data', true);
    }
}

function updatePrinterCardStatus(printerId, info) {
    const card = document.getElementById(`card-${printerId}`);
    if (!card) return;
    const badge = card.querySelector('.status-badge');
    if (badge) {
        badge.className = `status-badge ${info.status}`;
        badge.innerHTML = info.status === 'printing'
            ? `<span class="pulse-dot" style="display:inline-block;margin-right:5px"></span>${info.label}`
            : info.label;
    }
    const isOffline = info.status === 'offline';
    const tempValues = card.querySelectorAll('.temp-value');
    if (tempValues.length >= 2) {
        tempValues[0].innerHTML = formatTempHtml(info.hotend, isOffline);
        tempValues[1].innerHTML = formatTempHtml(info.bed, isOffline);
    }
}

function refreshData() {
    loadData();
}

function setFilter(el, mat) {
    document.querySelectorAll('.filter-chip').forEach((pill) => pill.classList.remove('active'));
    el.classList.add('active');
    activeFilter = mat;
    renderFilaments();
}

function setPrinterSearch(value) {
    printerSearch = String(value || '');
    renderPrinters();
}

function getFilamentsForPrinter(printerId) {
    return filaments.filter((f) => f.printerId === printerId);
}

function statusLabel(status) {
    const map = { printing: 'PRINTING', idle: 'IDLE', offline: 'OFFLINE', maintenance: 'MAINT' };
    return map[status] || String(status || '').toUpperCase();
}

function normalizeTemp(value) {
    if (!value || typeof value !== 'object') return { c: null, t: null };
    const current = Number.isFinite(value.c) ? value.c : null;
    const target = Number.isFinite(value.t) ? value.t : null;
    return { c: current, t: target };
}

function formatTempHtml(temp, isOffline) {
    if (isOffline) return '-';
    if (!temp || !Number.isFinite(temp.c)) return '-';
    const current = Math.round(temp.c);
    const target = Number.isFinite(temp.t) ? Math.round(temp.t) : null;
    let html = `${current}&deg;`;
    if (target && target > 0) html += ` <span class="temp-target">/ ${target}&deg;</span>`;
    return html;
}

function renderAll() {
    renderPrinters();
    renderFilaments();
    updateStats();
}

async function updateStats() {
    const api = getApi();
    if (!api) return;
    try {
        const stats = await api.GET_EQUIPMENT_STATS();
        document.getElementById('stat-printers').textContent = stats.printers ?? 0;
        document.getElementById('stat-spools').textContent = stats.spools ?? 0;
        document.getElementById('stat-attached').textContent = stats.attached ?? 0;
        document.getElementById('stat-avail').textContent = stats.available ?? 0;
    } catch (e) {
        console.error('GET_EQUIPMENT_STATS failed:', e);
    }
}

function renderPrinters() {
    const grid = document.getElementById('printers-grid');
    const query = printerSearch.trim().toLowerCase();
    const list = query
        ? printers.filter((printer) => {
            const haystack = [printer.name, printer.model, printer.statusLabel, printer.status]
                .filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(query);
        })
        : printers;

    if (!list.length) {
        grid.innerHTML = '<div class="empty-state">No printers found.</div>';
        return;
    }

    const html = list.map((printer) => {
        const attached = getFilamentsForPrinter(printer.id);
        const chipsHtml = attached.map((f) => `
            <div class="attached-chip" id="chip-${f.id}" draggable="true" data-filament-id="${f.id}" data-printer-id="${printer.id}">
                <div class="chip-dot" style="background:${f.color};border:1px solid rgba(0,0,0,0.15)"></div>
                <span class="chip-name">${f.name}</span>
                <span class="chip-material">${f.material}</span>
                <button class="chip-remove" data-detach="${f.id}" title="Detach to pool" type="button">
                    <svg viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
                </button>
            </div>`).join('');

        const emptyHint = attached.length === 0 ? `
            <div class="drop-hint">
                <svg viewBox="0 0 24 24"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                Drag Filament Here
            </div>` : '';

        const label = statusLabel(printer.statusLabel || printer.status);
        const isOffline = printer.status === 'offline';
        const hotendHtml = formatTempHtml(printer.hotend, isOffline);
        const bedHtml = formatTempHtml(printer.bed, isOffline);

        return `
            <div class="printer-card" id="card-${printer.id}" data-printer-id="${printer.id}">
                <div class="printer-header">
                    <div class="printer-icon-stack">
                        <div class="printer-icon">
                            <svg viewBox="0 0 24 24">
                                <rect x="2" y="9" width="20" height="8" rx="2"/>
                                <polyline points="6 9 6 3 18 3 18 9"/>
                                <polyline points="6 17 6 21 18 21 18 17"/>
                                <circle cx="18" cy="13" r="1" fill="currentColor"/>
                            </svg>
                        </div>
                        <div class="printer-temps">
                            <div class="temp-row">
                                <i class="ti ti-flame temp-icon hotend" aria-hidden="true"></i>
                                <span class="temp-value">${hotendHtml}</span>
                            </div>
                            <div class="temp-row">
                                <i class="ti ti-square temp-icon" aria-hidden="true"></i>
                                <span class="temp-value">${bedHtml}</span>
                            </div>
                        </div>
                    </div>
                    <div class="printer-meta">
                        <div class="printer-name">${printer.name}</div>
                        <div class="printer-model">${printer.model}</div>
                    </div>
                    <div class="printer-actions">
                        <button class="edit-btn" data-edit-printer="${printer.id}" aria-label="Edit printer" title="Edit printer">
                            <i class="ti ti-pencil" aria-hidden="true"></i>
                        </button>
                        <div class="status-badge ${printer.status}">
                            ${printer.status === 'printing' ? '<span class="pulse-dot" style="display:inline-block;margin-right:5px"></span>' : ''}
                            ${label}
                        </div>
                    </div>
                </div>
                <div class="drop-zone ${attached.length === 0 ? 'empty' : ''}" id="zone-${printer.id}">
                    ${chipsHtml}
                    ${emptyHint}
                </div>
            </div>`;
    }).join('');

    grid.innerHTML = html;

    document.querySelectorAll('.printer-card').forEach((card) => {
        const printerId = card.dataset.printerId;
        card.addEventListener('dragover', (e) => onPrinterDragOver(e, printerId));
        card.addEventListener('dragleave', (e) => onPrinterDragLeave(e, printerId));
        card.addEventListener('drop', (e) => onPrinterDrop(e, printerId));
    });

    document.querySelectorAll('.attached-chip').forEach((chip) => {
        chip.addEventListener('dragstart', (e) => onChipDragStart(e, chip.dataset.filamentId, chip.dataset.printerId));
        chip.addEventListener('dragend', onDragEnd);
    });

    document.querySelectorAll('[data-detach]').forEach((button) => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                await detachFilament(button.dataset.detach);
                await loadData();
            } catch (error) {
                showToast(error?.message || 'Failed to detach filament', true);
            }
        });
    });

    document.querySelectorAll('[data-edit-printer]').forEach((button) => {
        button.addEventListener('click', () => openPrinterModal(button.dataset.editPrinter));
    });
}

function renderFilaments() {
    const pool = document.getElementById('pool-zone');
    const q = (document.getElementById('search-input').value || '').toLowerCase();

    const list = filaments.filter((f) => {
        const name = String(f.name || '').toLowerCase();
        const material = String(f.material || '').toLowerCase();
        const matchesSearch = !q || name.includes(q) || material.includes(q);
        const matchesMat = activeFilter === 'ALL' || f.material === activeFilter;
        return matchesSearch && matchesMat;
    });

    if (list.length === 0) {
        pool.innerHTML = '<div class="empty-state">NO SPOOLS FOUND</div>';
        return;
    }

    pool.innerHTML = list.map((f) => {
        const attached = f.printerId !== null;
        const printer = attached ? printers.find((p) => p.id === f.printerId) : null;
        return `
            <div class="filament-item ${attached ? 'attached-elsewhere' : ''}" id="item-${f.id}" draggable="true" data-filament-id="${f.id}">
                <div class="spool-icon" style="border-color:${f.color};background:${hexToRgba(f.color, 0.1)}">
                    <div class="spool-inner" style="border-color:${f.color}"></div>
                </div>
                <div class="filament-info">
                    <div class="filament-name">${f.name}</div>
                    <div class="filament-details">
                        <span class="filament-material">${f.material}</span>
                        <span class="filament-weight">${f.weight || 0}g</span>
                    </div>
                </div>
                <div class="filament-actions">
                    <button class="item-edit" data-edit-filament="${f.id}" type="button" aria-label="Edit filament" title="Edit filament">
                        <i class="ti ti-pencil" aria-hidden="true"></i>
                    </button>
                    ${attached ? `<div class="attached-tag">&#10003; ${printer ? printer.name.split(' ')[0] : ''}</div>` : ''}
                </div>
            </div>`;
    }).join('');

    document.querySelectorAll('.filament-item').forEach((item) => {
        item.addEventListener('dragstart', (e) => onFilamentDragStart(e, item.dataset.filamentId));
        item.addEventListener('dragend', onDragEnd);
    });

    document.querySelectorAll('[data-edit-filament]').forEach((button) => {
        button.addEventListener('click', () => {
            const filament = filaments.find((f) => f.id === button.dataset.editFilament);
            openFilamentModal(filament);
        });
    });
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function onFilamentDragStart(event, filamentId) {
    const filament = filaments.find((f) => f.id === filamentId);
    dragData = { filamentId, sourceType: filament?.printerId ? 'printer' : 'pool', sourcePrinterId: filament?.printerId ?? null };
    event.dataTransfer.effectAllowed = 'move';
    if (event.dataTransfer?.setDragImage) event.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
    showGhost(filament);
    setTimeout(() => document.getElementById(`item-${filamentId}`)?.classList.add('dragging'), 0);
}

function onChipDragStart(event, filamentId, printerId) {
    const filament = filaments.find((f) => f.id === filamentId);
    dragData = { filamentId, sourceType: 'printer', sourcePrinterId: printerId };
    event.dataTransfer.effectAllowed = 'move';
    if (event.dataTransfer?.setDragImage) event.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
    showGhost(filament);
    setTimeout(() => {
        document.getElementById(`chip-${filamentId}`)?.classList.add('dragging');
        document.getElementById(`item-${filamentId}`)?.classList.add('dragging');
    }, 0);
}

function onDragEnd() {
    dragData = null;
    hideGhost();
    document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    document.querySelectorAll('.drag-over-pool').forEach((el) => el.classList.remove('drag-over-pool'));
}

function onPrinterDragOver(event, printerId) {
    if (!dragData) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    document.getElementById(`card-${printerId}`)?.classList.add('drag-over');
}

function onPrinterDragLeave(event, printerId) {
    const card = document.getElementById(`card-${printerId}`);
    if (card && !card.contains(event.relatedTarget)) card.classList.remove('drag-over');
}

async function onPrinterDrop(event, printerId) {
    event.preventDefault();
    if (!dragData) return;
    await assignFilamentToPrinter(dragData.filamentId, printerId);
    await loadData();
}

function onPoolDragOver(event) {
    if (!dragData) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    document.getElementById('pool-zone')?.classList.add('drag-over-pool');
}

function onPoolDragLeave(event) {
    const zone = document.getElementById('pool-zone');
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drag-over-pool');
}

async function onPoolDrop(event) {
    event.preventDefault();
    if (!dragData) return;
    await detachFilament(dragData.filamentId);
    await loadData();
}

async function assignFilamentToPrinter(filamentId, printerId) {
    const api = getApi();
    if (!api) return;
    await api.ADD_FILAMENT_TO_PRINTER(printerId, filamentId);
}

async function detachFilament(filamentId) {
    const api = getApi();
    if (!api) return;
    const printer = printers.find((p) => p.filament_ids.includes(filamentId));
    if (!printer) return;
    await api.REMOVE_FILAMENT_FROM_PRINTER(printer.id, filamentId);
}

const ghost = document.getElementById('drag-ghost');

function showGhost(filament) {
    if (!filament) return;
    document.getElementById('ghost-dot').style.background = filament.color;
    document.getElementById('ghost-name').textContent = filament.name;
    ghost.classList.add('visible');
    document.addEventListener('dragover', moveGhost);
}

function hideGhost() {
    ghost.classList.remove('visible');
    document.removeEventListener('dragover', moveGhost);
}

function moveGhost(event) {
    ghost.style.left = `${event.clientX + 14}px`;
    ghost.style.top = `${event.clientY - 18}px`;
}

// --- Filament modal (add + edit merged) ---
// Pass a filament object to open in edit mode, nothing (or null) to open in add mode.
function openFilamentModal(filament = null) {
    activeFilamentId = filament?.id ?? null;
    selectedColor = filament?.color ?? COLOURS[0].hex;

    document.getElementById('f-name').value = filament?.name ?? '';

    const materialSelect = document.getElementById('f-material');
    const materialValue = filament?.material ?? 'PLA';
    const materialOptions = Array.from(materialSelect.options).map((o) => o.value);
    if (materialOptions.includes(materialValue)) {
        materialSelect.value = materialValue;
        document.getElementById('f-material-custom').value = '';
    } else {
        materialSelect.value = CUSTOM_MATERIAL_VALUE;
        document.getElementById('f-material-custom').value = materialValue;
    }

    document.getElementById('f-weight').value = filament?.weight ?? '';

    const dot = document.getElementById('f-colour-dot');
    if (dot) dot.style.background = selectedColor;

    syncMaterialInput();
    buildColorGrid();

    document.querySelector('#filament-modal .modal-title').textContent = filament ? 'EDIT FILAMENT' : 'ADD FILAMENT';
    document.querySelector('#filament-modal .button-confirm').textContent = filament ? 'Save Changes' : 'Add Spool';
    document.getElementById('filament-modal').classList.add('open');
}

function closeFilamentModal() {
    closeFilamentColourPicker();
    document.getElementById('filament-modal').classList.remove('open');
}

function syncMaterialInput() {
    const select = document.getElementById('f-material');
    const customGroup = document.getElementById('f-material-custom-group');
    const customInput = document.getElementById('f-material-custom');
    if (!select || !customGroup || !customInput) return;
    if (select.value === CUSTOM_MATERIAL_VALUE) {
        customGroup.classList.remove('is-hidden');
        customInput.focus();
    } else {
        customGroup.classList.add('is-hidden');
        customInput.value = '';
    }
}

function getMaterialValue() {
    const select = document.getElementById('f-material');
    const customInput = document.getElementById('f-material-custom');
    if (!select) return '';
    return select.value === CUSTOM_MATERIAL_VALUE ? customInput.value.trim() : select.value;
}

function buildColorGrid() {
    document.getElementById('f-colour-popover').innerHTML = COLOURS.map(({ hex, name }) =>
        `<button type="button" class="colour-popover-swatch${hex === selectedColor ? ' selected' : ''}" style="background:${hex}" data-color="${hex}" title="${name}"></button>`
    ).join('');
    document.querySelectorAll('#f-colour-popover .colour-popover-swatch').forEach((btn) =>
        btn.addEventListener('click', () => selectColor(btn.dataset.color, btn))
    );
}

function selectColor(hex, el) {
    selectedColor = hex;
    document.querySelectorAll('#f-colour-popover .colour-popover-swatch').forEach((btn) => btn.classList.remove('selected'));
    el.classList.add('selected');
    const dot = document.getElementById('f-colour-dot');
    if (dot) dot.style.background = hex;
}

function toggleFilamentColourPicker() {
    const popover = document.getElementById('f-colour-popover');
    popover.classList.contains('open') ? closeFilamentColourPicker() : popover.classList.add('open');
}

function closeFilamentColourPicker() {
    document.getElementById('f-colour-popover').classList.remove('open');
}

async function confirmAddFilament() {
    const name = document.getElementById('f-name').value.trim();
    const material = getMaterialValue();
    const weightValue = document.getElementById('f-weight').value.trim();
    const weight = weightValue ? parseInt(weightValue, 10) : null;

    if (!name) { document.getElementById('f-name').focus(); return; }
    if (!material) { document.getElementById('f-material-custom').focus(); return; }

    try {
        const api = getApi();
        if (!api) { showToast('API not ready', true); return; }
        if (activeFilamentId) {
            await api.UPDATE_FILAMENT(activeFilamentId, { name, material, color: selectedColor, diameter: DEFAULT_DIAMETER, weight });
            showToast('Filament updated');
        } else {
            await api.ADD_FILAMENT(name, material, selectedColor, DEFAULT_DIAMETER, weight);
            showToast('Filament added');
        }
        closeFilamentModal();
        await loadData();
    } catch (error) {
        showToast(error?.message || 'Failed to save filament', true);
    }
}

// --- Printer modal ---
function openPrinterModal(printerId) {
    if (printerId) {
        const printer = printers.find((p) => p.id === printerId);
        if (!printer) return;
        activePrinterId = printerId;
        document.getElementById('p-name').value = printer.name;
        document.getElementById('p-model').value = printer.model || '';
        document.getElementById('p-ip').value = printer.IP_address || '';
        document.getElementById('p-frontend').value = printer.frontend_port || '';
        document.getElementById('p-backend').value = printer.backend_port || '';
        document.getElementById('printer-modal-title').textContent = 'EDIT PRINTER';
        document.getElementById('printer-confirm').textContent = 'Save Changes';
        document.getElementById('printer-remove').style.display = 'inline-flex';
    } else {
        activePrinterId = null;
        document.getElementById('p-name').value = '';
        document.getElementById('p-model').value = '';
        document.getElementById('p-ip').value = '';
        document.getElementById('p-frontend').value = '';
        document.getElementById('p-backend').value = '7125';
        document.getElementById('printer-modal-title').textContent = 'ADD PRINTER';
        document.getElementById('printer-confirm').textContent = 'Add Printer';
        document.getElementById('printer-remove').style.display = 'none';
    }
    document.getElementById('printer-modal').classList.add('open');
}

function closePrinterModal() {
    document.getElementById('printer-modal').classList.remove('open');
}

async function confirmPrinterModal() {
    const name = document.getElementById('p-name').value.trim();
    if (!name) { document.getElementById('p-name').focus(); return; }

    const model = document.getElementById('p-model').value.trim() || null;
    const IP_address = document.getElementById('p-ip').value.trim() || null;
    const frontend_port = parseInt(document.getElementById('p-frontend').value, 10) || null;
    const backend_port = parseInt(document.getElementById('p-backend').value, 10) || 7125;

    try {
        const api = getApi();
        if (!api) { showToast('API not ready', true); return; }
        if (activePrinterId) {
            await api.UPDATE_PRINTER(activePrinterId, { name, model, IP_address, frontend_port, backend_port });
            showToast('Printer updated');
        } else {
            await api.ADD_PRINTER(name, IP_address, frontend_port, backend_port, model);
            showToast('Printer added');
        }
        closePrinterModal();
        await loadData();
    } catch (error) {
        showToast(error?.message || 'Failed to save printer', true);
    }
}

async function removePrinterFromModal() {
    if (!activePrinterId) return;
    const api = getApi();
    if (!api) return;
    try {
        await api.REMOVE_PRINTER(activePrinterId);
        showToast('Printer removed');
        closePrinterModal();
        await loadData();
    } catch (error) {
        showToast(error?.message || 'Failed to remove printer', true);
    }
}

document.getElementById('filament-modal').addEventListener('click', (event) => {
    if (event.target === document.getElementById('filament-modal')) closeFilamentModal();
});

document.addEventListener('mousedown', (event) => {
    const wrap = document.getElementById('f-colour-swatch')?.closest('.colour-picker-wrap');
    if (wrap && !wrap.contains(event.target)) closeFilamentColourPicker();
});

document.getElementById('printer-modal').addEventListener('click', (event) => {
    if (event.target === document.getElementById('printer-modal')) closePrinterModal();
});

window.addEventListener('DOMContentLoaded', () => {
    const headerActions = document.getElementById('header-actions');
    const searchOpenBtn = document.getElementById('printer-search-open');
    const searchCloseBtn = document.getElementById('printer-search-close');
    const searchInput = document.getElementById('printer-search');

    const openSearch = () => {
        if (!headerActions || !searchInput) return;
        headerActions.classList.add('search-open');
        searchInput.focus();
        searchInput.select();
    };

    const closeSearch = () => {
        if (!headerActions || !searchInput) return;
        headerActions.classList.remove('search-open');
        if (searchInput.value) {
            searchInput.value = '';
            setPrinterSearch('');
        }
    };

    if (searchOpenBtn) searchOpenBtn.addEventListener('click', openSearch);
    if (searchCloseBtn) searchCloseBtn.addEventListener('click', closeSearch);
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') { event.preventDefault(); closeSearch(); }
        });
    }

    const addFilamentBtn = document.getElementById('add-filament-btn');
    if (addFilamentBtn) addFilamentBtn.addEventListener('click', openFilamentModal);

    const materialSelect = document.getElementById('f-material');
    if (materialSelect) materialSelect.addEventListener('change', syncMaterialInput);

    if (window.pywebview) {
        loadData();
    } else {
        window.addEventListener('pywebviewready', loadData);
        setTimeout(() => { if (!printers.length && !filaments.length) loadData(); }, 500);
    }
    setInterval(refreshData, 30000);
});

window.openFilamentModal = openFilamentModal;
window.closeFilamentModal = closeFilamentModal;
window.confirmAddFilament = confirmAddFilament;
window.setFilter = setFilter;
window.renderFilaments = renderFilaments;
window.onPoolDragOver = onPoolDragOver;
window.onPoolDragLeave = onPoolDragLeave;
window.onPoolDrop = onPoolDrop;
window.openPrinterModal = openPrinterModal;
window.closePrinterModal = closePrinterModal;
window.confirmPrinterModal = confirmPrinterModal;
window.removePrinterFromModal = removePrinterFromModal;
window.refreshData = refreshData;
