// --- Printer Status Check ---
async function checkPrinterStatus(printer) {
    // Attempts to query the Moonraker API on the printer's backend and frontend ports
    // to determine whether the printer is offline, idle, or actively printing.
    const ip = printer.IP_address; // Gets the printer's IP address from the printer object
    const none = { c: null, t: null }; // Default null temperature object used when data is unavailable
    if (!ip) return { status: 'offline', label: 'OFFLINE', hotend: none, bed: none }; // Returns offline immediately if no IP address is configured

    const backendPort = Number(printer.backend_port) || 7125; // Defaults to Moonraker's standard port (7125) if none is set
    const frontendPort = Number(printer.frontend_port) || null; // Gets the frontend UI port (e.g. Mainsail or Fluidd)
    const ports = frontendPort && frontendPort !== backendPort
        ? [backendPort, frontendPort] // Tries both ports if they differ from each other
        : [backendPort]; // Otherwise only tries the backend port

    const query = '/printer/objects/query?print_stats&virtual_sdcard&extruder&heater_bed'; // Moonraker API endpoint to fetch print state and temperatures in one request

    // First pass: attempt to get full status and temperature data from the Moonraker API
    for (const port of ports) {
        try {
            const res = await fetch(`http://${ip}:${port}${query}`, { signal: AbortSignal.timeout(3000) }); // Fetches printer data with a 3-second timeout to avoid hanging on offline printers
            if (!res.ok) continue; // Skips this port if the response status is not successful
            const data = await res.json(); // Parses the JSON response body
            const s = data?.result?.status ?? {}; // Extracts the status object from the Moonraker response structure
            const printStats = s.print_stats ?? {}; // Gets the print state information (printing, paused, idle, etc.)
            const sdcard = s.virtual_sdcard ?? {}; // Gets virtual SD card info, which contains the print progress value
            const ext = s.extruder ?? {}; // Gets hotend temperature readings
            const hb = s.heater_bed ?? {}; // Gets heated bed temperature readings
            const hotend = { c: ext.temperature ?? null, t: ext.target ?? null }; // Builds a current/target object for the hotend temperature
            const bed = { c: hb.temperature ?? null, t: hb.target ?? null }; // Builds a current/target object for the bed temperature
            if (printStats.state === 'printing') { // Checks if the printer is actively printing
                const p = sdcard.progress; // Gets the print progress as a decimal (0.0 to 1.0)
                const label = typeof p === 'number' ? `${Math.round(p * 100)}%` : 'PRINTING'; // Formats the progress as a percentage string
                return { status: 'printing', label, hotend, bed }; // Returns a printing status with progress and temperature data
            }
            return { status: 'idle', label: 'ONLINE', hotend, bed }; // Printer is reachable but not actively printing
        } catch {} // Silently ignores connection errors and tries the next port
    }

    // Second pass: fall back to a no-cors ping to check if any port is reachable at all
    for (const port of ports) {
        try {
            await fetch(`http://${ip}:${port}`, { mode: 'no-cors', signal: AbortSignal.timeout(3000) }); // Attempts a basic connectivity ping with no CORS restrictions
            return { status: 'idle', label: 'ONLINE', hotend: none, bed: none }; // Port is reachable but temperature data is not available
        } catch {} // Silently ignores this port if it is also unreachable
    }

    return { status: 'offline', label: 'OFFLINE', hotend: none, bed: none }; // No ports responded — the printer is considered offline
}

// --- Toast Notifications ---
function showToast(message, isError = false) {
    // Shows a brief pop-up notification bar at the bottom of the screen.
    // Applies a red error style when isError is true to indicate a failure or warning.
    const toast = document.getElementById('app-toast'); // Gets the shared toast element from the DOM
    if (!toast) return; // Exits safely if the toast element doesn't exist on this page
    toast.textContent = message; // Sets the notification message text
    toast.classList.toggle('error', isError); // Applies the error CSS class if this is an error notification
    toast.classList.add('show'); // Triggers the CSS transition to make the toast visible
    setTimeout(() => toast.classList.remove('show'), 3500); // Automatically hides the toast after 3.5 seconds
}

// --- Colour Palette ---
const COLOURS = [ // List of all accent colours the user can choose from across the UI
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
