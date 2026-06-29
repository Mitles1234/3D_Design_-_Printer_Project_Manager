const pill = document.querySelector('.nav-pill'); // Gets the animated sliding pill element that highlights the active nav link

// --- Sidebar Printer List ---
const PRINTER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="9" width="20" height="8" rx="2"/>
  <polyline points="6 9 6 3 18 3 18 9"/>
  <polyline points="6 17 6 21 18 21 18 17"/>
  <circle cx="18" cy="13" r="1" fill="currentColor" stroke="none"/>
</svg>`; // SVG icon string used for each printer entry in the sidebar

async function loadSidebarPrinters() {
    // Fetches the list of printers from the backend and renders them into the sidebar.
    // After the initial render, asynchronously checks each printer's live status and updates its indicator dot.
    try {
        const data = await pywebview.api.LIST_PRINTERS(false); // Fetches printers without live status for a fast initial load
        renderSidebarPrinters(data || []); // Renders the printer list, using an empty array as fallback if no data is returned
        (data || []).forEach(p => { // Loops over each printer to check its live status asynchronously
            checkPrinterStatus(p).then(({ status }) => { // Checks the live printer status without blocking the sidebar render
                const dot = document.getElementById(`sb-dot-${p.printer_id}`); // Finds the status indicator dot element for this printer
                if (dot) dot.className = `sb-status-dot ${status}`; // Updates the dot's CSS class to reflect the current online/printing/offline status
            });
        });
    } catch {
        renderSidebarPrinters([]); // Renders an empty list if the API call fails
    }
}

function renderSidebarPrinters(data) {
    // Builds and inserts the printer item elements into the sidebar container.
    // Clicking a printer navigates to its web interface URL if available, otherwise falls back to the equipment page.
    const container = document.getElementById('sidebar-printers'); // Gets the sidebar printers container element
    if (!container) return; // Exits safely if the container doesn't exist on this page
    container.innerHTML = ''; // Clears any previously rendered printer items
    data.forEach(p => { // Loops over each printer object in the data array
        const status = p.status || 'offline'; // Defaults to offline if no status field is present
        const url = p.IP_address && p.frontend_port
            ? `http://${p.IP_address}:${p.frontend_port}` // Builds the printer's web interface URL from its IP and frontend port
            : null; // No URL if the printer has no network configuration
        const item = document.createElement('div'); // Creates the wrapper element for this sidebar printer entry
        item.className = 'sb-printer-item'; // Applies the sidebar item CSS class for styling
        item.title = p.name || 'Printer'; // Sets the tooltip text to the printer's name
        item.innerHTML = `
            <div class="sb-printer-icon">${PRINTER_SVG}</div>
            <div class="sb-printer-row">
                <span class="sb-status-dot offline" id="sb-dot-${p.printer_id}"></span>
                <span class="sb-printer-name">${p.name || 'Printer'}</span>
            </div>`; // Renders the printer icon and name with an initially offline status dot
        item.addEventListener('click', () => {
            const target = url ?? 'equipment.html'; // Falls back to the equipment page if no web interface URL exists
            navigate(target, document.getElementById('nav-equipment')); // Navigates to the printer's interface or the equipment page
        });
        container.appendChild(item); // Adds the completed printer item to the sidebar
    });
}

window.addEventListener('pywebviewready', loadSidebarPrinters); // Loads the sidebar when the pywebview Python bridge becomes ready
if (window.pywebview) loadSidebarPrinters(); // Also loads immediately if the bridge is already available (e.g. on page reload)
setInterval(loadSidebarPrinters, 30000); // Refreshes the sidebar printer list every 30 seconds to keep statuses current

// --- Navigation ---
function navigate(url, el) {
    // Updates the nav pill position to slide under the clicked element, then loads the target page in the iframe.
    // For external URLs (e.g. printer web interfaces), tests connectivity before loading to avoid a blank iframe.
    if (el) {
        const rect = el.getBoundingClientRect(); // Gets the clicked nav element's position relative to the viewport
        const headerRect = el.closest('header').getBoundingClientRect(); // Gets the header's bounding box to calculate relative offset
        pill.style.left = (rect.left - headerRect.left) + 'px'; // Moves the pill horizontally to sit under the clicked nav link
        pill.style.width = rect.width + 'px'; // Resizes the pill to match the width of the nav link
    }

    if (!url.startsWith('http')) { // If the URL is a local page (e.g. projects.html or equipment.html)
        document.getElementById('content').src = url; // Loads the local page directly into the content iframe
        return; // Stops here — no connectivity check is needed for local pages
    }

    // For external URLs, verify reachability before loading to avoid a stuck blank iframe
    fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(2000) }) // Tests connectivity with a 2-second timeout
        .then(() => document.getElementById('content').src = url) // Loads the external URL in the iframe if reachable
        .catch(() => {
            document.getElementById('content').src = 'equipment.html'; // Falls back to the equipment page on connection failure
            showToast('Failed to load page, Please check the 3D Printer Settings', true); // Notifies the user that the printer page could not be reached
        });
}

// Set the nav pill to the first link on startup
window.addEventListener('DOMContentLoaded', () => {
    const firstLink = document.querySelector('header a'); // Gets the first navigation link in the header
    if (firstLink) firstLink.click(); // Simulates a click to position the pill and load the default page
});


// --- Settings Modal State ---
let _settingsExtensions = []; // Holds the current list of tracked file extensions for the duration of the settings session
let _settingsDir = ''; // Holds the currently selected project directory path for the duration of the settings session
let _selectedExt = null; // Tracks which extension is currently highlighted in the list (for the remove button)
let _extEditing = false; // Tracks whether an inline add-extension text input is currently active

async function OpenSettingsModal() {
    // Opens the settings modal and populates it with the current saved settings from the Python backend.
    document.getElementById('settings-modal').classList.add('open'); // Shows the settings modal overlay
    _selectedExt = null; // Clears any previously selected extension to reset the remove button state
    _extEditing = false; // Ensures no edit session is considered active when reopening
    try {
        const s = await pywebview.api.GET_SETTINGS(); // Fetches the current settings object from the Python backend
        _settingsExtensions = (s.File_Extensions || []).map(e => e.toLowerCase().replace(/^\./, '')); // Normalises extensions to lowercase and removes any leading dots
        _settingsDir = s.Project_Directory || ''; // Stores the saved project directory path
    } catch {
        _settingsExtensions = []; // Defaults to an empty list if settings cannot be loaded
        _settingsDir = ''; // Defaults to no directory if settings cannot be loaded
    }
    document.getElementById('settings-dir-path').textContent = _settingsDir || '(not set)'; // Displays the directory path or a placeholder if none is set
    renderExtList(); // Renders the extension list with the loaded data
}

function renderExtList() {
    // Re-renders the file extension list from the in-memory _settingsExtensions array.
    // Highlights the selected extension and enables or disables the remove button accordingly.
    const list = document.getElementById('ext-list'); // Gets the extension list container element
    list.innerHTML = ''; // Clears the existing list items before re-rendering
    _settingsExtensions.forEach(ext => { // Loops over each extension in the in-memory array
        const row = document.createElement('div'); // Creates a row element for this extension entry
        row.className = 'ext-list-item' + (ext === _selectedExt ? ' selected' : ''); // Applies the selected class if this extension is the active selection
        row.textContent = ext; // Sets the display text to the extension string
        row.addEventListener('click', () => {
            if (_extEditing) return; // Ignores clicks while an inline add-input is active
            _selectedExt = _selectedExt === ext ? null : ext; // Toggles selection — clicking an already-selected item deselects it
            renderExtList(); // Re-renders the list to update the selection highlight
        });
        list.appendChild(row); // Adds the row to the extension list
    });
    document.getElementById('ext-remove-btn').disabled = !_selectedExt; // Enables the remove button only when an extension is currently selected
}

function beginAddExt() {
    // Inserts an inline text input at the bottom of the extension list for the user to type a new extension.
    // Pressing Enter or losing focus commits the value; Escape cancels without adding.
    if (_extEditing) return; // Prevents opening a second input if one is already in progress
    _extEditing = true; // Marks that an inline edit session has started
    _selectedExt = null; // Clears any selection so the remove button stays disabled during input
    document.getElementById('ext-remove-btn').disabled = true; // Explicitly disables the remove button during the edit session

    const list = document.getElementById('ext-list'); // Gets the extension list container
    const row = document.createElement('div'); // Creates a row that will hold the inline input field
    row.className = 'ext-list-item editing'; // Applies the editing style to visually distinguish the new row

    const input = document.createElement('input'); // Creates the inline text input element
    input.className = 'ext-list-input'; // Applies the input field CSS class
    input.placeholder = 'e.g. stl'; // Shows a hint example of what to type
    input.maxLength = 20; // Limits the input to a reasonable maximum length
    input.autocomplete = 'off'; // Disables browser autocomplete so it doesn't interfere with typing
    row.appendChild(input); // Adds the input field inside the row
    list.appendChild(row); // Adds the row to the bottom of the extension list
    list.scrollTop = list.scrollHeight; // Scrolls the list down to ensure the new input is visible
    input.focus(); // Focuses the input immediately so the user can start typing

    let committed = false; // Guards against the value being committed twice (blur fires after Enter)
    function commit() {
        if (committed) return; // Prevents double-processing if both Enter and blur fire
        committed = true; // Marks as committed so subsequent events are ignored
        const val = input.value.trim().toLowerCase().replace(/^\./, ''); // Normalises the value: trim whitespace, lowercase, and strip a leading dot
        if (val && !_settingsExtensions.includes(val)) { // Adds the extension only if it's non-empty and not already in the list
            _settingsExtensions.push(val); // Appends the new extension to the in-memory list
        }
        _extEditing = false; // Marks the edit session as complete
        renderExtList(); // Re-renders the list to show the newly added extension
    }
    function cancel() {
        if (committed) return; // Prevents processing if a commit has already occurred
        committed = true; // Marks as committed to block further event handlers
        _extEditing = false; // Ends the edit session without adding any extension
        renderExtList(); // Re-renders to remove the inline input row cleanly
    }
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); } // Commits the new extension when Enter is pressed
        if (e.key === 'Escape') { e.preventDefault(); cancel(); } // Cancels the input when Escape is pressed
    });
    input.addEventListener('blur', commit); // Commits automatically when the input loses focus
}

function removeSelectedExt() {
    // Removes the currently selected extension from the in-memory list and re-renders the list.
    if (!_selectedExt) return; // Exits if no extension is currently selected
    _settingsExtensions = _settingsExtensions.filter(e => e !== _selectedExt); // Filters out the selected extension from the array
    _selectedExt = null; // Clears the selection after removal
    renderExtList(); // Re-renders the list without the removed extension
}

function closeSettingsModal() {
    // Closes the settings modal overlay without saving any pending changes.
    document.getElementById('settings-modal').classList.remove('open'); // Hides the settings modal
}

async function confirmSettingsModal() {
    // Saves the current in-memory settings to the Python backend and closes the modal.
    // Shows a warning toast if the selected directory was not found on the filesystem.
    try {
        const saved = await pywebview.api.UPDATE_SETTINGS({ // Sends the updated settings to the Python backend
            File_Extensions: _settingsExtensions, // Passes the current in-memory list of tracked file extensions
            Project_Directory: _settingsDir, // Passes the current project directory path
        });
        if (_settingsDir && saved.Project_Directory !== _settingsDir) { // Checks if the backend rejected the directory path
            showToast('Directory not found — keeping previous path', true); // Warns the user that the typed path was not valid
        } else {
            showToast('Settings saved'); // Confirms successful save to the user
        }
    } catch {
        showToast('Failed to save settings', true); // Notifies the user if the backend save operation failed
    }
    closeSettingsModal(); // Closes the modal regardless of whether the save succeeded
}

// --- Settings Event Listeners ---
document.getElementById('ext-add-btn').addEventListener('click', beginAddExt); // Opens the inline add-extension input when the + button is clicked
document.getElementById('ext-remove-btn').addEventListener('click', removeSelectedExt); // Removes the selected extension when the − button is clicked

document.getElementById('settings-dir-browse').addEventListener('click', async () => {
    // Opens the native OS folder picker and updates the displayed project directory path.
    try {
        const dir = await pywebview.api.PICK_DIRECTORY(); // Invokes the native folder picker dialog via the Python backend
        if (dir) { // Only updates if the user selected a folder (not cancelled)
            _settingsDir = dir; // Stores the chosen directory path in the session state
            document.getElementById('settings-dir-path').textContent = _settingsDir; // Updates the displayed path in the modal
        }
    } catch { /* user cancelled or not running inside pywebview */ } // Silently ignores cancellations and non-webview environments
});

document.getElementById('settings-modal').addEventListener('click', (event) => {
    // Closes the settings modal when the user clicks directly on the backdrop (outside the modal panel).
    if (event.target === document.getElementById('settings-modal')) { // Checks the click landed on the backdrop and not inside the modal
        closeSettingsModal(); // Closes the modal
    }
});

// --- Global Exports ---
// These expose modal functions globally so they can be called from inline onclick attributes in index.html
window.OpenSettingsModal = OpenSettingsModal; // Exports the open function for the settings gear icon onclick
window.closeSettingsModal = closeSettingsModal; // Exports the close function for the Cancel button onclick
window.confirmSettingsModal = confirmSettingsModal; // Exports the save function for the Save button onclick
