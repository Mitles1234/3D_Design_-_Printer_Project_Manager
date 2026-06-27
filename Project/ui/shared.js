async function checkPrinterStatus(printer) {
    const ip = printer.IP_address;
    const none = { c: null, t: null };
    if (!ip) return { status: 'offline', label: 'OFFLINE', hotend: none, bed: none };

    const backendPort = Number(printer.backend_port) || 7125;
    const frontendPort = Number(printer.frontend_port) || null;
    const ports = frontendPort && frontendPort !== backendPort
        ? [backendPort, frontendPort]
        : [backendPort];

    const query = '/printer/objects/query?print_stats&virtual_sdcard&extruder&heater_bed';

    for (const port of ports) {
        try {
            const res = await fetch(`http://${ip}:${port}${query}`, { signal: AbortSignal.timeout(3000) });
            if (!res.ok) continue;
            const data = await res.json();
            const s = data?.result?.status ?? {};
            const printStats = s.print_stats ?? {};
            const sdcard = s.virtual_sdcard ?? {};
            const ext = s.extruder ?? {};
            const hb = s.heater_bed ?? {};
            const hotend = { c: ext.temperature ?? null, t: ext.target ?? null };
            const bed = { c: hb.temperature ?? null, t: hb.target ?? null };
            if (printStats.state === 'printing') {
                const p = sdcard.progress;
                const label = typeof p === 'number' ? `${Math.round(p * 100)}%` : 'PRINTING';
                return { status: 'printing', label, hotend, bed };
            }
            return { status: 'idle', label: 'ONLINE', hotend, bed };
        } catch {}
    }

    for (const port of ports) {
        try {
            await fetch(`http://${ip}:${port}`, { mode: 'no-cors', signal: AbortSignal.timeout(3000) });
            return { status: 'idle', label: 'ONLINE', hotend: none, bed: none };
        } catch {}
    }

    return { status: 'offline', label: 'OFFLINE', hotend: none, bed: none };
}

function showToast(message, isError = false) {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

const COLOURS = [
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
