const COLORS = [
  { hex: '#ef4444', name: 'Red' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#eab308', name: 'Yellow' },
  { hex: '#84cc16', name: 'Lime' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#10b981', name: 'Emerald' },
  { hex: '#14b8a6', name: 'Teal' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#6366f1', name: 'Indigo' },
  { hex: '#8b5cf6', name: 'Violet' },
  { hex: '#ec4899', name: 'Pink' },
  { hex: '#ffffff', name: 'White' },
  { hex: '#94a3b8', name: 'Silver' },
  { hex: '#1e1e2e', name: 'Black' },
  { hex: '#78350f', name: 'Brown' },
  { hex: '#fde68a', name: 'Cream' },
];

const DEFAULT_DIAMETER = 1.75;
const CUSTOM_MATERIAL_VALUE = '__custom__';

let printers = [];
let filaments = [];
let dragData = null;
let selectedColor = COLORS[0].hex;
let activeFilter = 'ALL';
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
  document.querySelectorAll('.filter-pill').forEach((pill) => pill.classList.remove('active'));
  el.classList.add('active');
  activeFilter = mat;
  renderFilaments();
}

function getFilamentsForPrinter(printerId) {
  return filaments.filter((filament) => filament.printerId === printerId);
}

function statusLabel(status) {
  const map = { printing: 'PRINTING', idle: 'IDLE', offline: 'OFFLINE', maintenance: 'MAINT' };
  return map[status] || String(status || '').toUpperCase();
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
  const html = printers.map((printer) => {
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

    return `
      <div class="printer-card" id="card-${printer.id}" data-printer-id="${printer.id}">
        <div class="printer-header">
          <div class="printer-icon">
            <svg viewBox="0 0 24 24">
              <rect x="2" y="9" width="20" height="8" rx="2"/>
              <polyline points="6 9 6 3 18 3 18 9"/>
              <polyline points="6 17 6 21 18 21 18 17"/>
              <circle cx="18" cy="13" r="1" fill="currentColor"/>
            </svg>
          </div>
          <div class="printer-meta">
            <div class="printer-name">${printer.name}</div>
            <div class="printer-model">${printer.model}</div>
          </div>
          <div class="printer-actions">
            <button class="edit-btn" data-edit-printer="${printer.id}">EDIT</button>
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
          <button class="item-edit" data-edit-filament="${filament.id}" type="button">EDIT</button>
          <div class="drag-handle">
            <svg viewBox="0 0 24 24"><line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/></svg>
          </div>
        </div>
        ${attached ? `<div class="attached-tag">✓ ${printer ? printer.name.split(' ')[0] : ''}</div>` : ''}
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
  selectedColor = COLORS[0].hex;
  document.getElementById('f-name').value = '';
  document.getElementById('f-material').value = 'PLA';
  document.getElementById('f-material-custom').value = '';
  document.getElementById('f-weight').value = '';
  syncMaterialInput();
  buildColorGrid();
  document.querySelector('#filament-modal .modal-title').textContent = 'ADD FILAMENT';
  document.querySelector('#filament-modal .btn-confirm').textContent = 'Add Spool';
  document.getElementById('filament-modal').classList.add('open');
}

function openFilamentModalForEdit(filamentId) {
  const filament = filaments.find((item) => item.id === filamentId);
  if (!filament) return;
  filamentModalMode = 'edit';
  activeFilamentId = filamentId;
  selectedColor = filament.color || COLORS[0].hex;
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
  document.querySelector('#filament-modal .btn-confirm').textContent = 'Save Changes';
  document.getElementById('filament-modal').classList.add('open');
}

function closeFilamentModal() {
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
  const grid = document.getElementById('color-grid');
  grid.innerHTML = COLORS.map((color) => `
    <div class="color-swatch ${color.hex === selectedColor ? 'selected' : ''}"
      data-color="${color.hex}"
      style="background:${color.hex};border:2px solid ${color.hex === '#ffffff' || color.hex === '#fde68a' ? '#555' : color.hex}"
      title="${color.name}"></div>
  `).join('');

  grid.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => selectColor(swatch.dataset.color, swatch));
  });
}

function selectColor(hex, el) {
  selectedColor = hex;
  document.querySelectorAll('.color-swatch').forEach((swatch) => swatch.classList.remove('selected'));
  el.classList.add('selected');
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

document.getElementById('printer-modal').addEventListener('click', (event) => {
  if (event.target === document.getElementById('printer-modal')) closePrinterModal();
});

window.addEventListener('DOMContentLoaded', () => {
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
