
// --- Constants ---
const DEFAULT_DIAMETER = 1.75; // Standard filament diameter in millimetres used when no value is specified
const CUSTOM_MATERIAL_VALUE = '__custom__'; // Sentinel value used in the material select to indicate the user wants to type a custom material
const TRANSPARENT_DRAG_IMAGE = new Image(); // Creates a blank image to replace the browser's default drag ghost with a custom one
TRANSPARENT_DRAG_IMAGE.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='; // Sets the image to a 1×1 transparent GIF

// --- Page State ---
let printers = []; // Holds the list of printer objects currently loaded from the backend
let filaments = []; // Holds the list of filament spool objects currently loaded from the backend
let dragData = null; // Stores the drag source information while a filament drag operation is in progress
let selectedColor = COLOURS[0].hex; // Tracks the currently selected colour in the filament colour picker
let activeFilter = 'ALL'; // Tracks the currently active material filter chip in the filament pool
let printerSearch = ''; // Holds the current printer search query string
let activeFilamentId = null; // Stores the ID of the filament being edited (null when adding a new one)
let activePrinterId = null; // Stores the ID of the printer being edited (null when adding a new one)

// --- API Handle ---
// Same pattern as projects.js — accesses the pywebview API from the current window or parent iframe.
function getApi() {
    if (window.pywebview?.api) return window.pywebview.api; // Returns the API directly if running in the top-level webview
    try {
        if (window.parent !== window) return window.parent.pywebview?.api ?? null; // Falls back to the parent frame's API if running inside an iframe
    } catch (_) {} // Ignores cross-origin errors silently
    return null; // Returns null if no API bridge is available
}

// --- Data Loading ---
async function loadData() {
    // Fetches both printers and filaments from the backend simultaneously, then renders the full UI.
    // Retries up to 5 times with a short delay to handle the pywebview bridge initialising asynchronously.
    let api = null;
    for (let attempt = 0; attempt < 5; attempt++) { // Tries up to 5 times to get the API bridge
        api = getApi(); // Attempts to get the API reference
        if (api) break; // Stops retrying once the API is available
        await new Promise(r => setTimeout(r, 250)); // Waits 250ms before the next attempt
    }
    if (!api) return; // Exits if the API bridge never became available

    try {
        const [printerData, filamentData] = await Promise.all([ // Fetches printers and filaments in parallel to minimise load time
            api.LIST_PRINTERS(false), // Fetches the list of printers without live status data
            api.LIST_FILAMENTS(), // Fetches the full list of filament spools
        ]);

        // Maps raw printer API objects to a normalised shape used by the UI
        printers = (printerData || []).map((printer) => ({
            id: printer.printer_id, // Unique identifier for the printer
            name: printer.name || 'Unnamed Printer', // Display name, falling back if none is set
            model: printer.model || 'Unknown model', // Printer model string, falling back if none is set
            status: 'offline', // Initial status before live check completes
            statusLabel: 'OFFLINE', // Initial displayed status label
            hotend: { c: null, t: null }, // Initial hotend temperature (current / target)
            bed: { c: null, t: null }, // Initial bed temperature (current / target)
            filament_ids: Array.isArray(printer.filament_ids) ? printer.filament_ids : [], // Ensures filament_ids is always an array
            IP_address: printer.IP_address || '', // Network IP address of the printer
            frontend_port: printer.frontend_port || '', // Port for the printer's web interface (e.g. Mainsail)
            backend_port: printer.backend_port || 7125, // Port for the Moonraker API, defaulting to 7125
        }));

        // Maps raw filament API objects to a normalised shape used by the UI
        filaments = (filamentData || []).map((filament) => ({
            id: filament.filament_id, // Unique identifier for the filament spool
            name: filament.name || 'Untitled Spool', // Display name, falling back if none is set
            material: filament.material || 'PLA', // Material type, defaulting to PLA
            color: filament.color || '#94a3b8', // Colour hex value, defaulting to silver
            weight: filament.weight || 0, // Remaining weight in grams
            diameter: filament.diameter || DEFAULT_DIAMETER, // Filament diameter in mm
            printerId: null, // Will be set below if this filament is attached to a printer
        }));

        const filamentMap = new Map(filaments.map((f) => [f.id, f])); // Builds a lookup map from filament ID to filament object for efficient access
        printers.forEach((printer) => { // Loops over each printer to assign its attached filaments
            printer.filament_ids.forEach((fid) => { // Loops over each filament ID listed for this printer
                const f = filamentMap.get(fid); // Looks up the filament object by ID
                if (f) f.printerId = printer.id; // Marks the filament as attached to this printer
            });
        });

        renderAll(); // Re-renders the full UI with the freshly loaded data

        // Asynchronously check live printer status after the initial render
        printers.forEach(printer => {
            checkPrinterStatus(printer).then(info => { // Queries the printer's live status without blocking the render
                const p = printers.find(p => p.id === printer.id); // Finds the printer in the local array to update its status
                if (p) { p.status = info.status; p.statusLabel = info.label; p.hotend = info.hotend; p.bed = info.bed; } // Updates the in-memory printer status and temperatures
                updatePrinterCardStatus(printer.id, info); // Updates the rendered card without a full re-render
            });
        });
    } catch (error) {
        showToast(error.message || 'Failed to load data', true); // Shows an error toast if data loading failed
    }
}

function updatePrinterCardStatus(printerId, info) {
    // Updates the status badge and temperature values on an already-rendered printer card in place,
    // without triggering a full re-render of the printer grid.
    const card = document.getElementById(`card-${printerId}`); // Finds the rendered card element for this printer
    if (!card) return; // Exits if the card is not currently in the DOM
    const badge = card.querySelector('.status-badge'); // Gets the status badge element inside the card
    if (badge) {
        badge.className = `status-badge ${info.status}`; // Updates the badge's CSS class to reflect the current status
        badge.innerHTML = info.status === 'printing'
            ? `<span class="pulse-dot" style="display:inline-block;margin-right:5px"></span>${info.label}` // Shows an animated pulse dot while printing
            : info.label; // Shows only the label text when idle or offline
    }
    const isOffline = info.status === 'offline'; // Determines if the printer is offline to show dashes instead of temperatures
    const tempValues = card.querySelectorAll('.temp-value'); // Gets both temperature display elements (hotend and bed)
    if (tempValues.length >= 2) {
        tempValues[0].innerHTML = formatTempHtml(info.hotend, isOffline); // Updates the hotend temperature display
        tempValues[1].innerHTML = formatTempHtml(info.bed, isOffline); // Updates the bed temperature display
    }
}

function refreshData() {
    // Triggers a full data reload from the backend. Called by the periodic refresh interval.
    loadData(); // Delegates to the main data loading function
}

// --- Filtering ---
function setFilter(el, mat) {
    // Sets the active material filter and re-renders the filament pool to show only matching spools.
    document.querySelectorAll('.filter-chip').forEach((pill) => pill.classList.remove('active')); // Removes the active class from all filter chips
    el.classList.add('active'); // Marks the clicked filter chip as active
    activeFilter = mat; // Stores the selected material filter string
    renderFilaments(); // Re-renders the filament pool with the new filter applied
}

function setPrinterSearch(value) {
    // Updates the printer search query and re-renders the printer grid to show only matching results.
    printerSearch = String(value || ''); // Stores the search query as a string, defaulting to empty
    renderPrinters(); // Re-renders the printer grid filtered by the new search query
}

// --- Helpers ---
function getFilamentsForPrinter(printerId) {
    // Returns the list of filament spools currently attached to a specific printer.
    return filaments.filter((f) => f.printerId === printerId); // Filters the filaments array to those assigned to this printer
}

function statusLabel(status) {
    // Converts an internal status string to a user-facing uppercase label.
    const map = { printing: 'PRINTING', idle: 'IDLE', offline: 'OFFLINE', maintenance: 'MAINT' }; // Maps each status key to its display label
    return map[status] || String(status || '').toUpperCase(); // Returns the mapped label or uppercases the raw status as a fallback
}

function normalizeTemp(value) {
    // Normalises a temperature object to ensure both current and target values are finite numbers or null.
    if (!value || typeof value !== 'object') return { c: null, t: null }; // Returns null temperatures if the input is not a valid object
    const current = Number.isFinite(value.c) ? value.c : null; // Uses the current temperature only if it is a finite number
    const target = Number.isFinite(value.t) ? value.t : null; // Uses the target temperature only if it is a finite number
    return { c: current, t: target }; // Returns the normalised temperature object
}

function formatTempHtml(temp, isOffline) {
    // Formats a temperature object into an HTML string showing the current value and optionally the target.
    // Returns a dash string when the printer is offline or temperature data is unavailable.
    if (isOffline) return '-'; // Shows a dash if the printer is offline
    if (!temp || !Number.isFinite(temp.c)) return '-'; // Shows a dash if no valid current temperature is available
    const current = Math.round(temp.c); // Rounds the current temperature to the nearest integer
    const target = Number.isFinite(temp.t) ? Math.round(temp.t) : null; // Rounds the target temperature if it is a valid number
    let html = `${current}&deg;`; // Builds the base temperature string with a degree symbol
    if (target && target > 0) html += ` <span class="temp-target">/ ${target}&deg;</span>`; // Appends the target temperature if it is set and non-zero
    return html; // Returns the formatted HTML string
}

// --- Rendering ---
function renderAll() {
    // Re-renders the full equipment page — printers grid, filament pool, and stats bar.
    renderPrinters(); // Re-renders all printer cards
    renderFilaments(); // Re-renders the filament pool
    updateStats(); // Refreshes the header statistics bar
}

async function updateStats() {
    // Fetches and displays the equipment statistics in the page header (total printers, spools, attached, available).
    const api = getApi(); // Gets the pywebview API reference
    if (!api) return; // Exits if the API bridge is not available
    try {
        const stats = await api.GET_EQUIPMENT_STATS(); // Requests the equipment counts from the Python backend
        document.getElementById('stat-printers').textContent = stats.printers ?? 0; // Updates the total printer count display
        document.getElementById('stat-spools').textContent = stats.spools ?? 0; // Updates the total spool count display
        document.getElementById('stat-attached').textContent = stats.attached ?? 0; // Updates the count of spools attached to printers
        document.getElementById('stat-avail').textContent = stats.available ?? 0; // Updates the count of spools available in the pool
    } catch (e) {
        console.error('GET_EQUIPMENT_STATS failed:', e); // Logs the error without crashing the UI
    }
}

function renderPrinters() {
    // Builds and inserts the printer card elements into the printers grid.
    // Applies the current search query filter and attaches drag-and-drop and edit event listeners.
    const grid = document.getElementById('printers-grid'); // Gets the printers grid container element
    const query = printerSearch.trim().toLowerCase(); // Normalises the search query for case-insensitive matching
    const list = query
        ? printers.filter((printer) => { // Filters the printer list if a search query is active
            const haystack = [printer.name, printer.model, printer.statusLabel, printer.status]
                .filter(Boolean).join(' ').toLowerCase(); // Combines searchable fields into a single lowercase string
            return haystack.includes(query); // Checks if any field matches the search query
          })
        : printers; // Uses the full list if no search query is set

    if (!list.length) {
        grid.innerHTML = '<div class="empty-state">No printers found.</div>'; // Shows an empty state message if no printers match
        return; // Stops rendering early
    }

    const html = list.map((printer) => {
        const attached = getFilamentsForPrinter(printer.id); // Gets the list of filaments attached to this printer
        const chipsHtml = attached.map((f) => `
            <div class="attached-chip" id="chip-${f.id}" draggable="true" data-filament-id="${f.id}" data-printer-id="${printer.id}">
                <div class="chip-dot" style="background:${f.color};border:1px solid rgba(0,0,0,0.15)"></div>
                <span class="chip-name">${f.name}</span>
                <span class="chip-material">${f.material}</span>
                <button class="chip-remove" data-detach="${f.id}" title="Detach to pool" type="button">
                    <svg viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
                </button>
            </div>`).join(''); // Renders a draggable chip for each attached filament spool

        const emptyHint = attached.length === 0 ? `
            <div class="drop-hint">
                <svg viewBox="0 0 24 24"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                Drag Filament Here
            </div>` : ''; // Shows a drop hint only when no filaments are attached to this printer

        const label = statusLabel(printer.statusLabel || printer.status); // Gets the display label for the current status
        const isOffline = printer.status === 'offline'; // Checks if the printer is offline to suppress temperature display
        const hotendHtml = formatTempHtml(printer.hotend, isOffline); // Formats the hotend temperature as HTML
        const bedHtml = formatTempHtml(printer.bed, isOffline); // Formats the bed temperature as HTML

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
            </div>`; // Builds the full printer card HTML including header, temperatures, and the filament drop zone
    }).join('');

    grid.innerHTML = html; // Inserts all rendered printer cards into the grid

    // Attach drag-and-drop listeners to each rendered printer card
    document.querySelectorAll('.printer-card').forEach((card) => {
        const printerId = card.dataset.printerId; // Gets the printer ID from the card's data attribute
        card.addEventListener('dragover', (e) => onPrinterDragOver(e, printerId)); // Handles a filament being dragged over this card
        card.addEventListener('dragleave', (e) => onPrinterDragLeave(e, printerId)); // Handles the drag leaving this card's bounds
        card.addEventListener('drop', (e) => onPrinterDrop(e, printerId)); // Handles a filament being dropped onto this card
    });

    // Attach drag listeners to each attached filament chip
    document.querySelectorAll('.attached-chip').forEach((chip) => {
        chip.addEventListener('dragstart', (e) => onChipDragStart(e, chip.dataset.filamentId, chip.dataset.printerId)); // Starts a drag from an attached chip
        chip.addEventListener('dragend', onDragEnd); // Cleans up drag state when the drag ends
    });

    // Attach detach listeners to the × buttons on attached filament chips
    document.querySelectorAll('[data-detach]').forEach((button) => {
        button.addEventListener('click', async (e) => {
            e.preventDefault(); // Prevents any default button behaviour
            e.stopPropagation(); // Stops the click from bubbling up to the card's drag handler
            try {
                await detachFilament(button.dataset.detach); // Detaches the filament from its printer via the backend API
                await loadData(); // Reloads all data to reflect the change
            } catch (error) {
                showToast(error?.message || 'Failed to detach filament', true); // Notifies the user if the detach operation failed
            }
        });
    });

    // Attach edit listeners to the pencil buttons on printer cards
    document.querySelectorAll('[data-edit-printer]').forEach((button) => {
        button.addEventListener('click', () => openPrinterModal(button.dataset.editPrinter)); // Opens the printer edit modal for the clicked printer
    });
}

function renderFilaments() {
    // Builds and inserts the filament spool items into the filament pool.
    // Applies the active material filter chip and the text search query before rendering.
    const pool = document.getElementById('pool-zone'); // Gets the filament pool container element
    const q = (document.getElementById('search-input').value || '').toLowerCase(); // Gets the current search input value as lowercase

    const list = filaments.filter((f) => { // Filters filaments by both the text search and material filter
        const name = String(f.name || '').toLowerCase(); // Normalises the filament name for case-insensitive matching
        const material = String(f.material || '').toLowerCase(); // Normalises the material type for case-insensitive matching
        const matchesSearch = !q || name.includes(q) || material.includes(q); // Checks if the spool matches the search query
        const matchesMat = activeFilter === 'ALL' || f.material === activeFilter; // Checks if the spool matches the active material filter
        return matchesSearch && matchesMat; // Only includes spools that match both filters
    });

    if (list.length === 0) {
        pool.innerHTML = '<div class="empty-state">NO SPOOLS FOUND</div>'; // Shows an empty state if no filaments match the filters
        return; // Stops rendering early
    }

    pool.innerHTML = list.map((f) => {
        const attached = f.printerId !== null; // Checks if this filament is attached to a printer
        const printer = attached ? printers.find((p) => p.id === f.printerId) : null; // Finds the printer this filament is attached to, if any
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
            </div>`; // Builds the filament item card, dimming it if already attached to a printer
    }).join('');

    // Attach drag listeners to each rendered filament item
    document.querySelectorAll('.filament-item').forEach((item) => {
        item.addEventListener('dragstart', (e) => onFilamentDragStart(e, item.dataset.filamentId)); // Starts a drag from a pool filament item
        item.addEventListener('dragend', onDragEnd); // Cleans up drag state when the drag ends
    });

    // Attach edit listeners to the pencil buttons on filament items
    document.querySelectorAll('[data-edit-filament]').forEach((button) => {
        button.addEventListener('click', () => {
            const filament = filaments.find((f) => f.id === button.dataset.editFilament); // Finds the filament object by ID
            openFilamentModal(filament); // Opens the filament edit modal pre-populated with this filament's data
        });
    });
}

function hexToRgba(hex, alpha) {
    // Converts a hex colour string to an rgba() CSS value with the given opacity.
    const r = parseInt(hex.slice(1, 3), 16); // Extracts the red channel from the hex string
    const g = parseInt(hex.slice(3, 5), 16); // Extracts the green channel from the hex string
    const b = parseInt(hex.slice(5, 7), 16); // Extracts the blue channel from the hex string
    return `rgba(${r},${g},${b},${alpha})`; // Returns the rgba CSS string with the given alpha
}

// --- Drag and Drop ---
function onFilamentDragStart(event, filamentId) {
    // Handles the start of a drag from a filament item in the pool.
    // Records the drag source and shows the custom drag ghost element.
    const filament = filaments.find((f) => f.id === filamentId); // Finds the filament object being dragged
    dragData = { filamentId, sourceType: filament?.printerId ? 'printer' : 'pool', sourcePrinterId: filament?.printerId ?? null }; // Records the filament ID, source type, and source printer if attached
    event.dataTransfer.effectAllowed = 'move'; // Indicates this is a move operation, not a copy
    if (event.dataTransfer?.setDragImage) event.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0); // Hides the browser's default drag ghost image
    showGhost(filament); // Shows the custom styled drag ghost near the cursor
    setTimeout(() => document.getElementById(`item-${filamentId}`)?.classList.add('dragging'), 0); // Adds the dragging class after a tick to prevent it applying before the drag starts
}

function onChipDragStart(event, filamentId, printerId) {
    // Handles the start of a drag from a filament chip attached to a printer card.
    const filament = filaments.find((f) => f.id === filamentId); // Finds the filament object being dragged
    dragData = { filamentId, sourceType: 'printer', sourcePrinterId: printerId }; // Records the drag source as coming from a specific printer
    event.dataTransfer.effectAllowed = 'move'; // Indicates this is a move operation
    if (event.dataTransfer?.setDragImage) event.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMAGE, 0, 0); // Hides the browser's default drag ghost image
    showGhost(filament); // Shows the custom styled drag ghost near the cursor
    setTimeout(() => {
        document.getElementById(`chip-${filamentId}`)?.classList.add('dragging'); // Dims the chip on the printer card
        document.getElementById(`item-${filamentId}`)?.classList.add('dragging'); // Also dims the pool item if visible
    }, 0); // Deferred to prevent visual glitch on drag start
}

function onDragEnd() {
    // Cleans up all drag state and visual indicators when a drag operation ends (drop or cancel).
    dragData = null; // Clears the stored drag source data
    hideGhost(); // Hides the custom drag ghost element
    document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging')); // Removes the dragging style from all elements
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over')); // Removes the drag-over highlight from all printer cards
    document.querySelectorAll('.drag-over-pool').forEach((el) => el.classList.remove('drag-over-pool')); // Removes the drag-over highlight from the filament pool
}

function onPrinterDragOver(event, printerId) {
    // Handles a filament being dragged over a printer card, applying a visual highlight.
    if (!dragData) return; // Ignores drag events if no drag is in progress
    event.preventDefault(); // Required to allow the drop event to fire on this element
    event.dataTransfer.dropEffect = 'move'; // Shows the move cursor icon during the drag
    document.getElementById(`card-${printerId}`)?.classList.add('drag-over'); // Highlights the printer card being hovered over
}

function onPrinterDragLeave(event, printerId) {
    // Removes the drag-over highlight from a printer card when the drag leaves its bounds.
    const card = document.getElementById(`card-${printerId}`); // Gets the printer card element
    if (card && !card.contains(event.relatedTarget)) card.classList.remove('drag-over'); // Only removes the highlight if the cursor has left the card entirely (not just moved to a child element)
}

async function onPrinterDrop(event, printerId) {
    // Handles a filament being dropped onto a printer card, assigning it to that printer.
    event.preventDefault(); // Prevents the browser's default drop behaviour
    if (!dragData) return; // Exits if no drag data is available
    await assignFilamentToPrinter(dragData.filamentId, printerId); // Calls the backend to assign the filament to the printer
    await loadData(); // Reloads all data to reflect the assignment change
}

function onPoolDragOver(event) {
    // Handles a filament being dragged over the filament pool, applying a visual highlight.
    if (!dragData) return; // Ignores drag events if no drag is in progress
    event.preventDefault(); // Required to allow the drop event to fire
    event.dataTransfer.dropEffect = 'move'; // Shows the move cursor icon
    document.getElementById('pool-zone')?.classList.add('drag-over-pool'); // Highlights the pool zone while a filament is being dragged over it
}

function onPoolDragLeave(event) {
    // Removes the drag-over highlight from the filament pool when the drag leaves its bounds.
    const zone = document.getElementById('pool-zone'); // Gets the pool zone element
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drag-over-pool'); // Removes the highlight only if the cursor has truly left the pool area
}

async function onPoolDrop(event) {
    // Handles a filament being dropped into the pool, detaching it from any printer it was assigned to.
    event.preventDefault(); // Prevents the browser's default drop behaviour
    if (!dragData) return; // Exits if no drag data is available
    await detachFilament(dragData.filamentId); // Calls the backend to remove the filament from its printer
    await loadData(); // Reloads all data to reflect the detachment
}

async function assignFilamentToPrinter(filamentId, printerId) {
    // Calls the backend API to assign a filament spool to a specific printer.
    const api = getApi(); // Gets the pywebview API reference
    if (!api) return; // Exits if the API is not available
    await api.ADD_FILAMENT_TO_PRINTER(printerId, filamentId); // Sends the assignment request to the Python backend
}

async function detachFilament(filamentId) {
    // Calls the backend API to remove a filament spool from whichever printer it is attached to.
    const api = getApi(); // Gets the pywebview API reference
    if (!api) return; // Exits if the API is not available
    const printer = printers.find((p) => p.filament_ids.includes(filamentId)); // Finds the printer that currently holds this filament
    if (!printer) return; // Exits if the filament is not attached to any printer
    await api.REMOVE_FILAMENT_FROM_PRINTER(printer.id, filamentId); // Sends the removal request to the Python backend
}

// --- Drag Ghost ---
const ghost = document.getElementById('drag-ghost'); // Gets the custom drag ghost overlay element

function showGhost(filament) {
    // Displays the custom drag ghost element near the cursor with the filament's name and colour.
    if (!filament) return; // Exits if no filament data is available
    document.getElementById('ghost-dot').style.background = filament.color; // Sets the colour dot to match the filament's colour
    document.getElementById('ghost-name').textContent = filament.name; // Sets the ghost label to the filament's name
    ghost.classList.add('visible'); // Makes the ghost element visible
    document.addEventListener('dragover', moveGhost); // Starts tracking the mouse position to move the ghost
}

function hideGhost() {
    // Hides the custom drag ghost element and stops tracking mouse position.
    ghost.classList.remove('visible'); // Hides the ghost element
    document.removeEventListener('dragover', moveGhost); // Removes the mousemove listener to stop updating the ghost position
}

function moveGhost(event) {
    // Updates the position of the custom drag ghost to follow the cursor.
    ghost.style.left = `${event.clientX + 14}px`; // Positions the ghost slightly to the right of the cursor
    ghost.style.top = `${event.clientY - 18}px`; // Positions the ghost slightly above the cursor
}

// --- Filament Modal (Add and Edit) ---
// Pass a filament object to open in edit mode; pass nothing or null to open in add mode.
function openFilamentModal(filament = null) {
    // Opens the filament modal, pre-populating it with the given filament's data for editing,
    // or with blank defaults when adding a new spool.
    activeFilamentId = filament?.id ?? null; // Stores the editing filament's ID, or null for a new spool
    selectedColor = filament?.color ?? COLOURS[0].hex; // Sets the colour picker to the filament's colour or the default

    document.getElementById('f-name').value = filament?.name ?? ''; // Pre-fills the name field with the filament's name

    const materialSelect = document.getElementById('f-material'); // Gets the material dropdown element
    const materialValue = filament?.material ?? 'PLA'; // Gets the filament's material or defaults to PLA
    const materialOptions = Array.from(materialSelect.options).map((o) => o.value); // Gets all available option values from the dropdown
    if (materialOptions.includes(materialValue)) { // If the material is one of the standard options
        materialSelect.value = materialValue; // Sets the dropdown to the matching standard material
        document.getElementById('f-material-custom').value = ''; // Clears the custom material input
    } else { // If the material is a custom value not in the dropdown
        materialSelect.value = CUSTOM_MATERIAL_VALUE; // Sets the dropdown to the "Add custom..." option
        document.getElementById('f-material-custom').value = materialValue; // Pre-fills the custom input with the material name
    }

    document.getElementById('f-weight').value = filament?.weight ?? ''; // Pre-fills the weight field with the filament's remaining weight

    const dot = document.getElementById('f-colour-dot'); // Gets the colour swatch dot element
    if (dot) dot.style.background = selectedColor; // Updates the swatch to show the current colour

    syncMaterialInput(); // Shows or hides the custom material input based on the current dropdown state
    buildColorGrid(); // Builds the colour picker grid with the current selection highlighted

    document.querySelector('#filament-modal .modal-title').textContent = filament ? 'EDIT FILAMENT' : 'ADD FILAMENT'; // Sets the modal title based on add or edit mode
    document.querySelector('#filament-modal .button-confirm').textContent = filament ? 'Save Changes' : 'Add Spool'; // Sets the confirm button label based on mode
    document.getElementById('filament-remove').style.display = filament ? 'inline-flex' : 'none'; // Shows the remove button only in edit mode
    document.getElementById('filament-modal').classList.add('open'); // Opens the modal
}

function closeFilamentModal() {
    // Closes the filament modal and ensures the colour picker popover is also closed.
    closeFilamentColourPicker(); // Closes the colour picker if it was left open
    document.getElementById('filament-modal').classList.remove('open'); // Hides the filament modal
}

function syncMaterialInput() {
    // Shows or hides the custom material text input based on the current material dropdown selection.
    const select = document.getElementById('f-material'); // Gets the material dropdown
    const customGroup = document.getElementById('f-material-custom-group'); // Gets the container for the custom input field
    const customInput = document.getElementById('f-material-custom'); // Gets the custom material text input
    if (!select || !customGroup || !customInput) return; // Exits if any required element is missing
    if (select.value === CUSTOM_MATERIAL_VALUE) { // If "Add custom..." is selected in the dropdown
        customGroup.classList.remove('is-hidden'); // Shows the custom material input group
        customInput.focus(); // Focuses the input so the user can start typing immediately
    } else { // If a standard material is selected
        customGroup.classList.add('is-hidden'); // Hides the custom material input group
        customInput.value = ''; // Clears the custom input so it doesn't interfere with the standard selection
    }
}

function getMaterialValue() {
    // Returns the effective material value — either the selected standard option or the typed custom value.
    const select = document.getElementById('f-material'); // Gets the material dropdown element
    const customInput = document.getElementById('f-material-custom'); // Gets the custom material text input
    if (!select) return ''; // Returns empty string if the dropdown doesn't exist
    return select.value === CUSTOM_MATERIAL_VALUE ? customInput.value.trim() : select.value; // Returns the custom input if "Add custom..." is selected, otherwise returns the dropdown value
}

function buildColorGrid() {
    // Populates the colour picker popover with colour swatch buttons from the shared COLOURS array.
    document.getElementById('f-colour-popover').innerHTML = COLOURS.map(({ hex, name }) =>
        `<button type="button" class="colour-popover-swatch${hex === selectedColor ? ' selected' : ''}" style="background:${hex}" data-color="${hex}" title="${name}"></button>`
    ).join(''); // Renders a button for each colour, marking the currently selected one
    document.querySelectorAll('#f-colour-popover .colour-popover-swatch').forEach((btn) =>
        btn.addEventListener('click', () => selectColor(btn.dataset.color, btn)) // Attaches a click listener to each swatch to select its colour
    );
}

function selectColor(hex, el) {
    // Updates the selected colour state and reflects the change in the picker UI and the swatch dot.
    selectedColor = hex; // Stores the newly selected hex colour
    document.querySelectorAll('#f-colour-popover .colour-popover-swatch').forEach((btn) => btn.classList.remove('selected')); // Removes the selected class from all swatches
    el.classList.add('selected'); // Marks the clicked swatch as selected
    const dot = document.getElementById('f-colour-dot'); // Gets the colour swatch dot in the form
    if (dot) dot.style.background = hex; // Updates the dot to show the newly selected colour
}

function toggleFilamentColourPicker() {
    // Toggles the filament colour picker popover open or closed.
    const popover = document.getElementById('f-colour-popover'); // Gets the colour picker popover element
    popover.classList.contains('open') ? closeFilamentColourPicker() : popover.classList.add('open'); // Closes it if already open, opens it if closed
}

function closeFilamentColourPicker() {
    // Closes the filament colour picker popover.
    document.getElementById('f-colour-popover').classList.remove('open'); // Removes the open class to hide the popover
}

async function confirmAddFilament() {
    // Validates the filament form and calls the backend to either add a new spool or update an existing one.
    const name = document.getElementById('f-name').value.trim(); // Gets and trims the filament name input
    const material = getMaterialValue(); // Gets the effective material value from the dropdown or custom input
    const weightValue = document.getElementById('f-weight').value.trim(); // Gets the weight input value as a string
    const weight = weightValue ? parseInt(weightValue, 10) : null; // Parses the weight as an integer, or null if not provided

    if (!name) { document.getElementById('f-name').focus(); return; } // Focuses the name field and stops if it is empty
    if (!material) { document.getElementById('f-material-custom').focus(); return; } // Focuses the custom material field and stops if it is empty

    try {
        const api = getApi(); // Gets the pywebview API reference
        if (!api) { showToast('API not ready', true); return; } // Stops if the API bridge is not available
        if (activeFilamentId) { // If editing an existing filament
            await api.UPDATE_FILAMENT(activeFilamentId, { name, material, color: selectedColor, diameter: DEFAULT_DIAMETER, weight }); // Sends the updated data to the backend
            showToast('Filament updated'); // Confirms the update to the user
        } else { // If adding a new filament
            await api.ADD_FILAMENT(name, material, selectedColor, DEFAULT_DIAMETER, weight); // Sends the new filament data to the backend
            showToast('Filament added'); // Confirms the addition to the user
        }
        closeFilamentModal(); // Closes the modal after saving
        await loadData(); // Reloads all data to reflect the change in the UI
    } catch (error) {
        showToast(error?.message || 'Failed to save filament', true); // Notifies the user if the save operation failed
    }
}

async function removeFilamentFromModal() {
    // Deletes the currently edited filament spool via the backend and refreshes the UI.
    if (!activeFilamentId) return; // Exits if no filament is currently being edited
    const api = getApi(); // Gets the pywebview API reference
    if (!api) return; // Exits if the API bridge is not available
    try {
        await api.REMOVE_FILAMENT(activeFilamentId); // Calls the backend to permanently delete the filament
        showToast('Filament removed'); // Confirms the removal to the user
        closeFilamentModal(); // Closes the modal after deletion
        await loadData(); // Reloads all data to remove the spool from the UI
    } catch (error) {
        showToast(error?.message || 'Failed to remove filament', true); // Notifies the user if the delete operation failed
    }
}

// --- Printer Modal ---
function openPrinterModal(printerId) {
    // Opens the printer modal in edit mode if a printerId is given, or in add mode if not.
    // Pre-populates the form fields with the existing printer's data when editing.
    if (printerId) { // Edit mode
        const printer = printers.find((p) => p.id === printerId); // Finds the printer object by ID
        if (!printer) return; // Exits if the printer was not found in the local array
        activePrinterId = printerId; // Stores the ID of the printer being edited
        document.getElementById('p-name').value = printer.name; // Pre-fills the name field
        document.getElementById('p-model').value = printer.model || ''; // Pre-fills the model field
        document.getElementById('p-ip').value = printer.IP_address || ''; // Pre-fills the IP address field
        document.getElementById('p-frontend').value = printer.frontend_port || ''; // Pre-fills the frontend port field
        document.getElementById('p-backend').value = printer.backend_port || ''; // Pre-fills the backend port field
        document.getElementById('printer-modal-title').textContent = 'EDIT PRINTER'; // Sets the modal title to edit mode
        document.getElementById('printer-confirm').textContent = 'Save Changes'; // Changes the confirm button label to save
        document.getElementById('printer-remove').style.display = 'inline-flex'; // Shows the remove button in edit mode
    } else { // Add mode
        activePrinterId = null; // Clears the active ID for a new printer
        document.getElementById('p-name').value = ''; // Clears the name field
        document.getElementById('p-model').value = ''; // Clears the model field
        document.getElementById('p-ip').value = ''; // Clears the IP address field
        document.getElementById('p-frontend').value = ''; // Clears the frontend port field
        document.getElementById('p-backend').value = '7125'; // Sets the backend port to the Moonraker default
        document.getElementById('printer-modal-title').textContent = 'ADD PRINTER'; // Sets the modal title to add mode
        document.getElementById('printer-confirm').textContent = 'Add Printer'; // Sets the confirm button label to add
        document.getElementById('printer-remove').style.display = 'none'; // Hides the remove button in add mode
    }
    document.getElementById('printer-modal').classList.add('open'); // Opens the printer modal
}

function closePrinterModal() {
    // Closes the printer modal without saving any changes.
    document.getElementById('printer-modal').classList.remove('open'); // Hides the printer modal
}

async function confirmPrinterModal() {
    // Validates the printer form and calls the backend to either add a new printer or update an existing one.
    const name = document.getElementById('p-name').value.trim(); // Gets and trims the printer name input
    if (!name) { document.getElementById('p-name').focus(); return; } // Focuses the name field and stops if it is empty

    const model = document.getElementById('p-model').value.trim() || null; // Gets the printer model, using null if empty
    const IP_address = document.getElementById('p-ip').value.trim() || null; // Gets the IP address, using null if empty
    const frontend_port = parseInt(document.getElementById('p-frontend').value, 10) || null; // Parses the frontend port as an integer, or null if not provided
    const backend_port = parseInt(document.getElementById('p-backend').value, 10) || 7125; // Parses the backend port, defaulting to 7125

    try {
        const api = getApi(); // Gets the pywebview API reference
        if (!api) { showToast('API not ready', true); return; } // Stops if the API bridge is not available
        if (activePrinterId) { // If editing an existing printer
            await api.UPDATE_PRINTER(activePrinterId, { name, model, IP_address, frontend_port, backend_port }); // Sends the updated printer data to the backend
            showToast('Printer updated'); // Confirms the update to the user
        } else { // If adding a new printer
            await api.ADD_PRINTER(name, IP_address, frontend_port, backend_port, model); // Sends the new printer data to the backend
            showToast('Printer added'); // Confirms the addition to the user
        }
        closePrinterModal(); // Closes the modal after saving
        await loadData(); // Reloads all data to show the updated printer in the UI
    } catch (error) {
        showToast(error?.message || 'Failed to save printer', true); // Notifies the user if the save operation failed
    }
}

async function removePrinterFromModal() {
    // Deletes the currently edited printer via the backend and refreshes the UI.
    if (!activePrinterId) return; // Exits if no printer is currently being edited
    const api = getApi(); // Gets the pywebview API reference
    if (!api) return; // Exits if the API bridge is not available
    try {
        await api.REMOVE_PRINTER(activePrinterId); // Calls the backend to permanently delete the printer
        showToast('Printer removed'); // Confirms the removal to the user
        closePrinterModal(); // Closes the modal after deletion
        await loadData(); // Reloads all data to remove the printer from the UI
    } catch (error) {
        showToast(error?.message || 'Failed to remove printer', true); // Notifies the user if the delete operation failed
    }
}

// --- Modal Backdrop Click Listeners ---
document.getElementById('filament-modal').addEventListener('click', (event) => {
    if (event.target === document.getElementById('filament-modal')) closeFilamentModal(); // Closes the filament modal when clicking outside the modal panel
});

document.addEventListener('mousedown', (event) => {
    const wrap = document.getElementById('f-colour-swatch')?.closest('.colour-picker-wrap'); // Gets the colour picker wrapper element
    if (wrap && !wrap.contains(event.target)) closeFilamentColourPicker(); // Closes the colour picker when clicking outside of it
});

document.getElementById('printer-modal').addEventListener('click', (event) => {
    if (event.target === document.getElementById('printer-modal')) closePrinterModal(); // Closes the printer modal when clicking outside the modal panel
});

// --- Initialisation ---
window.addEventListener('DOMContentLoaded', () => {
    // Sets up the printer search bar toggle and loads all data once the DOM is ready.
    const headerActions = document.getElementById('header-actions'); // Gets the header actions container
    const searchOpenBtn = document.getElementById('printer-search-open'); // Gets the button that opens the search bar
    const searchCloseBtn = document.getElementById('printer-search-close'); // Gets the button that closes the search bar
    const searchInput = document.getElementById('printer-search'); // Gets the printer search text input

    const openSearch = () => {
        if (!headerActions || !searchInput) return; // Exits if the required elements are missing
        headerActions.classList.add('search-open'); // Expands the header to show the search input
        searchInput.focus(); // Focuses the search input so the user can start typing immediately
        searchInput.select(); // Selects any existing text in the input
    };

    const closeSearch = () => {
        if (!headerActions || !searchInput) return; // Exits if the required elements are missing
        headerActions.classList.remove('search-open'); // Collapses the header back to hide the search input
        if (searchInput.value) { // Only clears the search if there was a query active
            searchInput.value = ''; // Clears the search input field
            setPrinterSearch(''); // Resets the search query and re-renders the printer grid
        }
    };

    if (searchOpenBtn) searchOpenBtn.addEventListener('click', openSearch); // Opens search when the search icon button is clicked
    if (searchCloseBtn) searchCloseBtn.addEventListener('click', closeSearch); // Closes search when the X button is clicked
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') { event.preventDefault(); closeSearch(); } // Closes the search bar when Escape is pressed
        });
    }

    const addFilamentBtn = document.getElementById('add-filament-btn'); // Gets the add filament button
    if (addFilamentBtn) addFilamentBtn.addEventListener('click', openFilamentModal); // Opens the add filament modal when clicked

    const materialSelect = document.getElementById('f-material'); // Gets the material dropdown in the filament modal
    if (materialSelect) materialSelect.addEventListener('change', syncMaterialInput); // Shows or hides the custom input when the dropdown changes

    // Load initial data, handling the pywebview bridge potentially not being ready yet
    if (window.pywebview) {
        loadData(); // Loads immediately if the bridge is already available
    } else {
        window.addEventListener('pywebviewready', loadData); // Loads when the bridge becomes ready
        setTimeout(() => { if (!printers.length && !filaments.length) loadData(); }, 500); // Fallback: retries after 500ms in case pywebviewready doesn't propagate into the iframe
    }
    setInterval(refreshData, 30000); // Refreshes all equipment data every 30 seconds
});

// --- Global Exports ---
// These expose functions globally so they can be called from inline onclick attributes in equipment.html
window.openFilamentModal = openFilamentModal;
window.closeFilamentModal = closeFilamentModal;
window.confirmAddFilament = confirmAddFilament;
window.removeFilamentFromModal = removeFilamentFromModal;
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
