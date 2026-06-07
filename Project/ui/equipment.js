
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
let filamentModalMode = 'add';
let activeFilamentId = null;
let printerModalMode = 'add';
let activePrinterId = null;

let apiPromise = null;
let apiStatusTimer = null;

function getApiHandle() {
  try {
    if (window.pywebview && window.pywebview.api) return window.pywebview.api;
  } catch (error) {
  }

  try {
    if (window.parent && window.parent !== window && window.parent.pywebview && window.parent.pywebview.api) {
      return window.parent.pywebview.api;
    }
  } catch (error) {
  }

  return null;
}

function showMessage(message, isError) {
  const node = document.getElementById('header-message');
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? '#dc2626' : '';
  setTimeout(() => {
    if (node.textContent === message) {
      node.textContent = '';
      node.style.color = '';
    }
  }, 3000);
}

function waitForApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const tryResolve = () => {
      const api = getApiHandle();
      if (api) {
        if (apiStatusTimer) {
          clearInterval(apiStatusTimer);
          apiStatusTimer = null;
        }
        resolve(api);
      }
    };

    tryResolve();
    window.addEventListener('pywebviewready', tryResolve, { once: true });
    try {
      if (window.parent && window.parent !== window) {
        window.parent.addEventListener('pywebviewready', tryResolve, { once: true });
      }
    } catch (error) {
    }

    const start = Date.now();
    apiStatusTimer = setInterval(() => {
      tryResolve();
      if (!getApiHandle() && Date.now() - start > 1500) {
        showMessage('Waiting for backend...', false);
      }
    }, 250);
  });
  return apiPromise;
}

async function loadData() {
  const api = await waitForApi();
  const [printerData, filamentData] = await Promise.all([
    api.LIST_PRINTERS(true),
    api.LIST_FILAMENTS(),
  ]);

  printers = (printerData || []).map((printer) => ({
    id: printer.printer_id,
    name: printer.name || 'Unnamed Printer',
    model: printer.model || 'Unknown model',
    status: printer.status || 'offline',
    statusLabel: printer.status_label || 'OFFLINE',
    hotend: normalizeTemp(printer.status_hotend),
    bed: normalizeTemp(printer.status_bed),
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

  const filamentMap = new Map(filaments.map((filament) => [filament.id, filament]));
  printers.forEach((printer) => {
    printer.filament_ids.forEach((filamentId) => {
      const filament = filamentMap.get(filamentId);
      if (filament) {
        filament.printerId = printer.id;
      }
    });
  });

  renderAll();
}

function refreshData() {
  loadData().catch((error) => {
    showMessage(error.message || 'Failed to load data', true);
  });
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
  return filaments.filter((filament) => filament.printerId === printerId);
}

function statusLabel(status) {
  const map = { printing: 'PRINTING', idle: 'IDLE', offline: 'OFFLINE', maintenance: 'MAINT' };
  return map[status] || String(status || '').toUpperCase();
}

function normalizeTemp(value) {
  if (!value || typeof value !== 'object') {
    return { c: null, t: null };
  }
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
  if (target && target > 0) {
    html += ` <span class="temp-target">/ ${target}&deg;</span>`;
  }
  return html;
}

function renderAll() {
  renderPrinters();
  renderFilaments();
  updateStats();
}

function updateStats() {
  document.getElementById('stat-printers').textContent = printers.length;
  document.getElementById('stat-spools').textContent = filaments.length;
  const attached = filaments.filter((filament) => filament.printerId).length;
  document.getElementById('stat-attached').textContent = attached;
  document.getElementById('stat-avail').textContent = filaments.length - attached;
}

function renderPrinters() {
  const grid = document.getElementById('printers-grid');
  const query = printerSearch.trim().toLowerCase();
  const list = query
    ? printers.filter((printer) => {
        const haystack = [printer.name, printer.model, printer.statusLabel, printer.status]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
    : printers;

  if (!list.length) {
    grid.innerHTML = '<div class="empty-state">No printers found.</div>';
    return;
  }

  const html = list.map((printer) => {
    const attached = getFilamentsForPrinter(printer.id);
    const chipsHtml = attached.map((filament) => `
      <div class="attached-chip"
        id="chip-${filament.id}"
        draggable="true"
        data-filament-id="${filament.id}"
        data-printer-id="${printer.id}">
        <div class="chip-dot" style="background:${filament.color};border:1px solid rgba(0,0,0,0.15)"></div>
        <span class="chip-name">${filament.name}</span>
        <span class="chip-material">${filament.material}</span>
        <button class="chip-remove" data-detach="${filament.id}" title="Detach to pool" type="button">
          <svg viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
        </button>
      </div>
    `).join('');

    const emptyHint = attached.length === 0 ? `
      <div class="drop-hint">
        <svg viewBox="0 0 24 24"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        drag filament here
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
    card.addEventListener('dragover', (event) => onPrinterDragOver(event, printerId));
    card.addEventListener('dragleave', (event) => onPrinterDragLeave(event, printerId));
    card.addEventListener('drop', (event) => onPrinterDrop(event, printerId));
  });

  document.querySelectorAll('.attached-chip').forEach((chip) => {
    chip.addEventListener('dragstart', (event) => onChipDragStart(event, chip.dataset.filamentId, chip.dataset.printerId));
    chip.addEventListener('dragend', onDragEnd);
  });

  document.querySelectorAll('[data-detach]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await detachFilament(button.dataset.detach);
        await loadData();
      } catch (error) {
        showMessage(error?.message || 'Failed to detach filament', true);
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

  const list = filaments.filter((filament) => {
    const name = String(filament.name || '').toLowerCase();
    const material = String(filament.material || '').toLowerCase();
    const matchesSearch = !q || name.includes(q) || material.includes(q);
    const matchesMat = activeFilter === 'ALL' || filament.material === activeFilter;
    return matchesSearch && matchesMat;
  });

  if (list.length === 0) {
    pool.innerHTML = '<div class="empty-state">NO SPOOLS FOUND</div>';
    return;
  }

  pool.innerHTML = list.map((filament) => {
    const attached = filament.printerId !== null;
    const printer = attached ? printers.find((printerItem) => printerItem.id === filament.printerId) : null;
    const dotColor = filament.color;
    const borderColor = filament.color;
    return `
      <div class="filament-item ${attached ? 'attached-elsewhere' : ''}"
        id="item-${filament.id}"
        draggable="true"
        data-filament-id="${filament.id}">
        <div class="spool-icon" style="border-color:${borderColor};background:${hexToRgba(dotColor,0.1)}">
          <div class="spool-inner" style="border-color:${borderColor}"></div>
        </div>
        <div class="filament-info">
          <div class="filament-name">${filament.name}</div>
          <div class="filament-details">
            <span class="filament-material">${filament.material}</span>
            <span class="filament-weight">${filament.weight || 0}g</span>
          </div>
        </div>
        <div class="filament-actions">
          <button class="item-edit" data-edit-filament="${filament.id}" type="button" aria-label="Edit filament" title="Edit filament">
            <i class="ti ti-pencil" aria-hidden="true"></i>
          </button>
          ${attached ? `<div class="attached-tag">✓ ${printer ? printer.name.split(' ')[0] : ''}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  document.querySelectorAll('.filament-item').forEach((item) => {
    const filamentId = item.dataset.filamentId;
    item.addEventListener('dragstart', (event) => onFilamentDragStart(event, filamentId));
    item.addEventListener('dragend', onDragEnd);
  });

  document.querySelectorAll('[data-edit-filament]').forEach((button) => {
    button.addEventListener('click', () => openFilamentModalForEdit(button.dataset.editFilament));
  });
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function onFilamentDragStart(event, filamentId) {
  const filament = filaments.find((item) => item.id === filamentId);
  dragData = { filamentId, sourceType: filament && filament.printerId ? 'printer' : 'pool', sourcePrinterId: filament ? filament.printerId : null };
  event.dataTransfer.effectAllowed = 'move';
  if (event.dataTransfer && event.dataTransfer.setDragImage) {
    event.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
  }
  showGhost(filament);
  setTimeout(() => {
    const el = document.getElementById(`item-${filamentId}`);
    if (el) el.classList.add('dragging');
  }, 0);
}

function onChipDragStart(event, filamentId, printerId) {
  const filament = filaments.find((item) => item.id === filamentId);
  dragData = { filamentId, sourceType: 'printer', sourcePrinterId: printerId };
  event.dataTransfer.effectAllowed = 'move';
  if (event.dataTransfer && event.dataTransfer.setDragImage) {
    event.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0);
  }
  showGhost(filament);
  setTimeout(() => {
    const chip = document.getElementById(`chip-${filamentId}`);
    if (chip) chip.classList.add('dragging');
    const item = document.getElementById(`item-${filamentId}`);
    if (item) item.classList.add('dragging');
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
  const card = document.getElementById(`card-${printerId}`);
  if (card) card.classList.add('drag-over');
}

function onPrinterDragLeave(event, printerId) {
  const card = document.getElementById(`card-${printerId}`);
  if (card && !card.contains(event.relatedTarget)) {
    card.classList.remove('drag-over');
  }
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
  if (zone && !zone.contains(event.relatedTarget)) {
    zone.classList.remove('drag-over-pool');
  }
}

async function onPoolDrop(event) {
  event.preventDefault();
  if (!dragData) return;

  await detachFilament(dragData.filamentId);
  await loadData();
}

async function assignFilamentToPrinter(filamentId, printerId) {
  const api = await waitForApi();
  await api.ADD_FILAMENT_TO_PRINTER(printerId, filamentId);
}

async function detachFilament(filamentId) {
  const api = await waitForApi();
  const printer = printers.find((item) => item.filament_ids.includes(filamentId));
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

function openFilamentModalInternal() {
  filamentModalMode = 'add';
  activeFilamentId = null;
  selectedColor = COLOURS[0].hex;
  document.getElementById('f-name').value = '';
  document.getElementById('f-material').value = 'PLA';
  document.getElementById('f-material-custom').value = '';
  document.getElementById('f-weight').value = '';
  const dot = document.getElementById('f-colour-dot');
  if (dot) dot.style.background = selectedColor;
  syncMaterialInput();
  buildColorGrid();
  document.querySelector('#filament-modal .modal-title').textContent = 'ADD FILAMENT';
  document.querySelector('#filament-modal .button-confirm').textContent = 'Add Spool';
  document.getElementById('filament-modal').classList.add('open');
}

function openFilamentModalForEdit(filamentId) {
  const filament = filaments.find((item) => item.id === filamentId);
  if (!filament) return;
  filamentModalMode = 'edit';
  activeFilamentId = filamentId;
  selectedColor = filament.color || COLORS[0].hex;
  const dot = document.getElementById('f-colour-dot');
  if (dot) dot.style.background = selectedColor;
  document.getElementById('f-name').value = filament.name;

  const materialSelect = document.getElementById('f-material');
  const materialOptions = Array.from(materialSelect.options).map((option) => option.value);
  const materialValue = filament.material || 'PLA';
  if (materialOptions.includes(materialValue)) {
    materialSelect.value = materialValue;
    document.getElementById('f-material-custom').value = '';
  } else {
    materialSelect.value = CUSTOM_MATERIAL_VALUE;
    document.getElementById('f-material-custom').value = materialValue;
  }

  document.getElementById('f-weight').value = filament.weight || '';
  syncMaterialInput();
  buildColorGrid();
  document.querySelector('#filament-modal .modal-title').textContent = 'EDIT FILAMENT';
  document.querySelector('#filament-modal .button-confirm').textContent = 'Save Changes';
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
  if (select.value === CUSTOM_MATERIAL_VALUE) {
    return customInput.value.trim();
  }
  return select.value;
}

function buildColorGrid() {
  const popover = document.getElementById('f-colour-popover');
  popover.innerHTML = '';
  COLOURS.forEach(({ hex, name }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'colour-popover-swatch' + (hex === selectedColor ? ' selected' : '');
    btn.style.background = hex;
    btn.dataset.color = hex;
    btn.title = name;
    btn.addEventListener('click', () => selectColor(hex, btn));
    popover.appendChild(btn);
  });
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

  if (!name) {
    document.getElementById('f-name').focus();
    return;
  }

  if (!material) {
    document.getElementById('f-material-custom').focus();
    return;
  }

  try {
    const api = await waitForApi();
    if (filamentModalMode === 'edit' && activeFilamentId) {
      await api.UPDATE_FILAMENT(activeFilamentId, {
        name,
        material,
        color: selectedColor,
        diameter: DEFAULT_DIAMETER,
        weight,
      });
      showMessage('Filament updated');
    } else {
      await api.ADD_FILAMENT(name, material, selectedColor, DEFAULT_DIAMETER, weight);
      showMessage('Filament added');
    }

    closeFilamentModal();
    await loadData();
  } catch (error) {
    showMessage(error?.message || 'Failed to save filament', true);
  }
}

function openPrinterModal(printerId) {
  if (printerId) {
    const printer = printers.find((item) => item.id === printerId);
    if (!printer) return;
    printerModalMode = 'edit';
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
    printerModalMode = 'add';
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
  if (!name) {
    document.getElementById('p-name').focus();
    return;
  }

  const model = document.getElementById('p-model').value.trim() || null;
  const IP_address = document.getElementById('p-ip').value.trim() || null;
  const frontend_port = parseInt(document.getElementById('p-frontend').value, 10) || null;
  const backend_port = parseInt(document.getElementById('p-backend').value, 10) || 7125;

  try {
    const api = await waitForApi();
    if (printerModalMode === 'edit' && activePrinterId) {
      await api.UPDATE_PRINTER(activePrinterId, {
        name,
        model,
        IP_address,
        frontend_port,
        backend_port,
      });
      showMessage('Printer updated');
    } else {
      await api.ADD_PRINTER(name, IP_address, frontend_port, backend_port, model);
      showMessage('Printer added');
    }

    closePrinterModal();
    await loadData();
  } catch (error) {
    showMessage(error?.message || 'Failed to save printer', true);
  }
}

async function removePrinterFromModal() {
  if (!activePrinterId) return;
  const api = await waitForApi();
  await api.REMOVE_PRINTER(activePrinterId);
  showMessage('Printer removed');
  closePrinterModal();
  await loadData();
}

document.getElementById('filament-modal').addEventListener('click', (event) => {
  if (event.target === document.getElementById('filament-modal')) closeFilamentModal();
});

document.addEventListener('click', (event) => {
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
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSearch();
      }
    });
  }

  const addFilamentBtn = document.getElementById('add-filament-btn');
  if (addFilamentBtn) {
    addFilamentBtn.addEventListener('click', () => openFilamentModalInternal());
  }

  const materialSelect = document.getElementById('f-material');
  if (materialSelect) {
    materialSelect.addEventListener('change', syncMaterialInput);
  }

  waitForApi().then(() => {
    loadData().catch((error) => {
      showMessage(error.message || 'Failed to load data', true);
    });
  });
  setInterval(() => {
    refreshData();
  }, 30000);
});

window.openFilamentModal = (filamentId) => {
  if (filamentId) {
    openFilamentModalForEdit(filamentId);
    return;
  }
  openFilamentModalInternal();
};

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