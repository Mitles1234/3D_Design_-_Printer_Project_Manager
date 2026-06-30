// --- Project Store ---
let PROJECTS = []; // Holds the full list of project objects loaded from the backend

// --- Search ---
let _searchQuery = ''; // Holds the current project name search query string

// --- Modal State ---
let modalMode = 'add'; // Tracks whether the project modal is in 'add' or 'edit' mode
let activeProjectId = null; // Stores the ID of the project being edited (null when adding a new one)
let selectedAccentColour = COLOURS[0].hex; // Tracks the currently selected accent colour in the project colour picker

// --- Sidebar State ---
let selPid = null; // Stores the project ID of the currently selected node in the sidebar
let selNid = null; // Stores the node ID of the currently selected revision in the sidebar
let selSbTab = 'notes'; // Tracks the currently active sidebar tab ('notes', 'files', or 'details')
let sbMdEdit = false; // Tracks whether the notes panel is in edit mode or preview mode
let sbNotes = ''; // Holds the current raw markdown content of the selected node's notes

// --- Connection Drag State ---
let connDrag = null; // Stores the state of an in-progress connection drag between nodes

// Stores the hover-listener references for each canvas so they can be cleanly removed before re-rendering
const connHoverListeners = new WeakMap();

// --- Colour Picker ---
function buildColourPopover() {
    // Populates the project colour picker popover with swatch buttons from the shared COLOURS array.
    // Runs once on page load to build the picker UI.
    const popover = document.getElementById('p-colour-popover'); // Gets the colour picker popover container
    COLOURS.forEach(({ hex, name }) => { // Loops over each colour in the shared palette
        const btn = document.createElement('button'); // Creates a swatch button element
        btn.type = 'button'; // Prevents the button from submitting any form
        btn.className = 'colour-popover-swatch'; // Applies the swatch CSS class
        btn.style.background = hex; // Sets the button's background to the colour's hex value
        btn.dataset.colour = hex; // Stores the hex value as a data attribute for selection tracking
        btn.title = name; // Sets the tooltip to the colour's name
        btn.addEventListener('click', () => pickColour(hex)); // Selects this colour when the swatch is clicked
        popover.appendChild(btn); // Adds the swatch button to the popover
    });
}
buildColourPopover(); // Runs immediately on load to build the colour picker

function toggleColourPicker() {
    // Toggles the project colour picker popover open or closed.
    const popover = document.getElementById('p-colour-popover'); // Gets the colour picker popover
    popover.classList.contains('open') ? closeColourPicker() : popover.classList.add('open'); // Closes if open, opens if closed
}

function closeColourPicker() {
    // Closes the project colour picker popover.
    document.getElementById('p-colour-popover').classList.remove('open'); // Removes the open class to hide the popover
}

function pickColour(hex) {
    // Updates the selected accent colour and reflects the change in the picker swatch and the selected button.
    selectedAccentColour = hex; // Stores the chosen hex colour as the current accent colour
    document.getElementById('p-colour-dot').style.background = hex; // Updates the colour dot in the form to show the selection

    document.querySelectorAll('#p-colour-popover .colour-popover-swatch').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.colour === hex); // Marks only the clicked swatch as selected
    });
}

document.addEventListener('mousedown', e => {
    const wrap = document.getElementById('p-colour-swatch')?.closest('.colour-picker-wrap'); // Gets the colour picker wrapper element
    if (wrap && !wrap.contains(e.target)) closeColourPicker(); // Closes the picker when the user clicks anywhere outside of it
});

// Clear name input error state as soon as the user starts typing
document.getElementById('p-name').addEventListener('input', function () {
    this.classList.remove('input-error'); // Removes the error highlight from the project name input on change
});
document.getElementById('r-name').addEventListener('input', function () {
    this.classList.remove('input-error'); // Removes the error highlight from the revision name input on change
});

// --- Helpers ---
function fmtDate(iso) {
    // Formats an ISO date string (YYYY-MM-DD) into a human-readable format like "5 Jun 2025".
    if (!iso) return 'No date'; // Returns a placeholder if no date is provided
    const [y, m, d] = iso.split('-'); // Splits the ISO string into year, month, and day parts
    if (!y || !m || !d) return iso; // Returns the raw string if it doesn't match the expected format
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; // Array of month abbreviations indexed from 0
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`; // Returns the formatted date string
}

function renderMd(raw) {
    // Converts a subset of Markdown syntax to HTML for display in the notes preview panel.
    // Strips the auto-generated Date line to avoid it appearing twice in the preview.
    if (!raw) return ''; // Returns empty string if no content is provided
    raw = raw.replace(/^\*\*Date:\*\*.*$/m, '').replace(/\n{3,}/g, '\n\n').trim(); // Removes the Date metadata line and collapses excess blank lines
    if (!raw) return ''; // Returns empty string if the content is blank after stripping
    return raw
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') // Escapes HTML special characters to prevent injection
        .replace(/^### (.+)$/gm, '<h3>$1</h3>') // Converts level-3 headings
        .replace(/^## (.+)$/gm, '<h2>$1</h2>') // Converts level-2 headings
        .replace(/^# (.+)$/gm, '<h1>$1</h1>') // Converts level-1 headings
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') // Converts bold text
        .replace(/\*(.+?)\*/g, '<em>$1</em>') // Converts italic text
        .replace(/`(.+?)`/g, '<code>$1</code>') // Converts inline code
        .replace(/^---$/gm, '<hr>') // Converts horizontal rules
        .replace(/^[-*] (.+)$/gm, '<li>$1</li>') // Converts list items
        .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`) // Wraps consecutive list items in a <ul> tag
        .replace(/^(?!<[hul\d]|<hr)(.+)$/gm, '<p>$1</p>'); // Wraps remaining plain text lines in <p> tags
}

// --- API Handle ---
// pywebview sets window.pywebview.api once the Python bridge is ready.
// The fallback checks window.parent in case this script runs inside an iframe.
function getApi() {
    if (window.pywebview?.api) return window.pywebview.api; // Returns the API directly if available on the current window
    try {
        if (window.parent !== window) return window.parent.pywebview?.api ?? null; // Falls back to the parent frame's API if running in an iframe
    } catch (_) {} // Ignores cross-origin access errors silently
    return null; // Returns null if no API bridge is available
}

// --- AI Generation ---
async function generateAI({ promptId, btnId, apiMethod, nameId, descId }) {
    // Calls the specified backend AI method with the user's prompt and populates the name and description fields with the result.
    // Shows a generating spinner during the request and an error state on failure.
    const prompt = document.getElementById(promptId).value.trim(); // Gets the user's prompt text
    if (!prompt) { document.getElementById(promptId).focus(); return; } // Focuses the prompt field and stops if it is empty

    const btn = document.getElementById(btnId); // Gets the generate button element
    const wrap = btn.parentElement; // Gets the button's wrapper for applying state CSS classes
    const api = getApi(); // Gets the pywebview API reference
    if (!api) { showToast('ERROR: API NOT READY', true); return; } // Stops if the API bridge is not available

    btn.disabled = true; // Disables the button to prevent multiple simultaneous requests
    wrap.classList.remove('ready', 'error'); // Clears any previous result state classes
    wrap.classList.add('generating'); // Applies the generating CSS class to show the spinner
    try {
        const result = await api[apiMethod](prompt); // Calls the AI backend method dynamically using the method name
        if (result.name)        document.getElementById(nameId).value = result.name; // Fills the name field with the AI-generated name
        if (result.description) document.getElementById(descId).value = result.description; // Fills the description field with the AI-generated description
        wrap.classList.remove('generating'); // Removes the spinner
        wrap.classList.add('ready'); // Applies the success state to show a checkmark
    } catch (err) {
        showToast('AI failed: ' + (err?.message || 'Unknown error').slice(0, 60), true); // Shows an error toast with the failure reason
        wrap.classList.remove('generating'); // Removes the spinner
        wrap.classList.add('error'); // Applies the error state CSS class
    } finally {
        btn.disabled = false; // Re-enables the button regardless of success or failure
    }
}

function generateWithAI() {
    // Triggers AI generation for the project name and description fields using the project prompt.
    return generateAI({ promptId: 'ai-user-prompt', btnId: 'ai-generate-btn', apiMethod: 'GENERATE_PROJECT_DETAILS', nameId: 'p-name', descId: 'p-description' });
}

// --- Layout Constants ---
const NW = 160;      // Width of each node card in pixels
const NODE_H = 78;   // Height of each node card in pixels
const COL_GAP = 220; // Horizontal gap between layout columns in pixels
const ROW_GAP = 110; // Vertical gap between rows within a column in pixels
const X0 = 36;       // Left margin offset for the first column in pixels
const Y0 = 28;       // Top margin offset for the first row in pixels

// --- Layout: column = depth in the DAG (number of ancestor nodes), sorted by date within each column ---
function layoutNodes(proj) {
    // Assigns x/y pixel coordinates to each node in a project using a topological sort.
    // Nodes are placed in columns based on their depth in the connection graph,
    // with nodes sorted by date within each column.
    const nodes = proj.nodes || []; // Gets the list of nodes in the project
    if (!nodes.length) return; // Exits early if there are no nodes to lay out
    const conns = proj.connections || []; // Gets the list of connections between nodes

    const outEdges = {}, inDeg = {}; // Initialises adjacency list and in-degree counter for topological sort

    nodes.forEach(n => { outEdges[n.node_id] = []; inDeg[n.node_id] = 0; }); // Sets up empty edge lists and zero in-degrees for all nodes

    conns.forEach(c => {
        if (outEdges[c.from] !== undefined && inDeg[c.to] !== undefined) { // Validates that both endpoints exist as nodes
            outEdges[c.from].push(c.to); // Adds the forward edge from source to target
            inDeg[c.to]++; // Increments the in-degree of the target node
        }
    });

    // Assign each node a column equal to the length of the longest chain leading to it (topological sort)
    const col = {}; // Maps each node ID to its assigned column index
    const queue = nodes.filter(n => inDeg[n.node_id] === 0).map(n => n.node_id); // Starts the queue with root nodes (no incoming edges)
    queue.forEach(id => { col[id] = 0; }); // Assigns root nodes to column 0
    while (queue.length > 0) {
        const cur = queue.shift(); // Takes the next node from the front of the queue
        outEdges[cur].forEach(nxt => { // Processes each outgoing neighbour
            col[nxt] = Math.max(col[nxt] || 0, col[cur] + 1); // Assigns the max depth seen so far to the neighbour
            inDeg[nxt]--; // Decrements the in-degree as this edge is processed
            if (inDeg[nxt] === 0) queue.push(nxt); // Adds the neighbour to the queue once all its predecessors are processed
        });
    }

    // Isolated nodes (no edges at all) are placed in columns after all connected nodes, ordered by date
    const assignedCols = Object.values(col); // Gets all assigned column indices
    const maxCol = assignedCols.length > 0 ? Math.max(...assignedCols) : -1; // Finds the rightmost assigned column
    [...nodes]
        .sort((a, b) => (a.date || '').localeCompare(b.date || '')) // Sorts isolated nodes by date
        .forEach((n, i) => { if (col[n.node_id] === undefined) col[n.node_id] = maxCol + 1 + i; }); // Places each isolated node in a new column after the connected nodes

    // Group nodes by column, then sort within each column by date
    const cols = {}; // Maps column index to the list of nodes in that column
    nodes.forEach(n => {
        const c = col[n.node_id]; // Gets the column assigned to this node
        if (!cols[c]) cols[c] = []; // Initialises the column array if it doesn't exist yet
        cols[c].push(n); // Adds the node to its column
    });
    Object.values(cols).forEach(c => c.sort((a, b) => (a.date || '').localeCompare(b.date || ''))); // Sorts nodes within each column by date for consistent ordering

    const colKeys = Object.keys(cols).map(Number).sort((a, b) => a - b); // Gets the column indices sorted numerically
    colKeys.forEach((c, ci) => {
        cols[c].forEach((n, ri) => { n.x = X0 + ci * COL_GAP; n.y = Y0 + ri * ROW_GAP; }); // Assigns pixel coordinates to each node based on its column and row position
    });
}

function projCanvasSize(proj) {
    // Returns the minimum canvas dimensions needed to fit all nodes in a project.
    const nodes = proj.nodes || []; // Gets the list of nodes
    if (!nodes.length) return { w: 400, h: 140 }; // Returns a minimum size for empty projects
    return {
        w: Math.max(...nodes.map(n => (n.x||0))) + NW + X0, // Width = rightmost node's x + node width + margin
        h: Math.max(...nodes.map(n => (n.y||0))) + NODE_H + Y0, // Height = bottommost node's y + node height + margin
    };
}

// --- Edge Geometry Helpers ---
function outPt(n) { return { x: n.x + NW, y: n.y + NODE_H/2 }; } // Returns the right-centre connection point (output) of a node
function inPt(n)  { return { x: n.x,      y: n.y + NODE_H/2 }; } // Returns the left-centre connection point (input) of a node

function midPt(f, t) {
    // Calculates the midpoint of a connection edge between two nodes, used to position the delete button.
    // For long-range connections, offsets the midpoint vertically to avoid placing the button over another node.
    const o=outPt(f), i=inPt(t); // Gets the output point of the source and input point of the target
    if (Math.abs(o.x - i.x) > COL_GAP) { // Checks if the edge spans more than one column gap
        if (i.y >= o.y) {
            return { x:(o.x+i.x)/2, y: o.y + ROW_GAP/2 }; // Offsets the midpoint downward for descending edges
        }
        else if (i.y < o.y) {
            return { x:(o.x+i.x)/2, y: o.y - ROW_GAP/2 }; // Offsets the midpoint upward for ascending edges
        }
    }

    return { x:(o.x+i.x)/2, y:(o.y+i.y)/2 }; // Returns a simple midpoint for same-column or adjacent connections
}

function edgePath(fn, tn) {
    // Builds an SVG path string for the connection curve between two nodes using cubic Bézier segments.
    // Uses a multi-segment routed path for connections that span more than one column gap.
    const o = outPt(fn), i = inPt(tn); // Gets the start and end connection points
    if (Math.abs(fn.x - tn.x) > COL_GAP) { // Checks if the connection spans multiple columns
        const dx = 45; // Horizontal offset for the Bézier control points in the curved segments
        var hz = 0; // Counts how many column gaps the horizontal segment needs to span
        while (hz*COL_GAP+2*dx < i.x - o.x) {
            hz++ // Increments until the horizontal run is long enough to bridge the distance
        }

        if (o.y < i.y) { // Target node is below the source — routes the horizontal segment below the source
            return `M${o.x} ${o.y} C${o.x+dx} ${o.y} ${o.x+dx} ${o.y+ROW_GAP/2} ${o.x+2*dx} ${o.y+ROW_GAP/2}
            M${o.x+2*dx} ${o.y+ROW_GAP/2} L ${o.x+hz*COL_GAP} ${o.y+ROW_GAP/2}
            M${o.x+hz*COL_GAP} ${o.y+ROW_GAP/2} C${o.x+hz*COL_GAP+dx} ${o.y+ROW_GAP/2} ${i.x-dx} ${i.y} ${i.x} ${i.y}`;
        }
        else if (o.y === i.y) { // Nodes are on the same row — routes the horizontal segment below both
            return `M${o.x} ${o.y} C${o.x+dx} ${o.y} ${o.x+dx} ${o.y+ROW_GAP/2} ${o.x+2*dx} ${o.y+ROW_GAP/2}
            M${o.x+2*dx} ${o.y+ROW_GAP/2} L ${i.x-2*dx} ${i.y+ROW_GAP/2}
            M${i.x-2*dx} ${i.y+ROW_GAP/2} C${i.x-dx} ${i.y+ROW_GAP/2} ${i.x-dx} ${i.y} ${i.x} ${i.y}`;
        }
        else if (o.y > i.y){ // Target node is above the source — routes the horizontal segment above the source
            return `M${o.x} ${o.y} C${o.x+dx} ${o.y} ${o.x+dx} ${o.y-ROW_GAP/2} ${o.x+2*dx} ${o.y-ROW_GAP/2}
            M${o.x+2*dx} ${o.y-ROW_GAP/2} L ${o.x+hz*COL_GAP} ${o.y-ROW_GAP/2}
            M${o.x+hz*COL_GAP} ${o.y-ROW_GAP/2} C${o.x+hz*COL_GAP+dx} ${o.y-ROW_GAP/2} ${i.x-dx} ${i.y} ${i.x} ${i.y}`;
        }
    }
    const dx = Math.max(Math.abs(i.x - o.x) * 0.45, 60); // Sets Bézier handle length proportional to horizontal distance, with a minimum
    return `M${o.x} ${o.y} C${o.x+dx} ${o.y} ${i.x-dx} ${i.y} ${i.x} ${i.y}`; // Returns a single cubic Bézier curve for short or same-column connections
}

function refreshCanvas(proj, svg, inner) {
    // Re-lays out nodes and redraws the SVG connection lines on an existing canvas element in-place.
    // Used after adding or removing a connection to update the canvas without rebuilding the full project card.
    layoutNodes(proj); // Recalculates pixel positions for all nodes in the project
    const sz = projCanvasSize(proj); // Gets the updated canvas dimensions after layout
    inner.style.width  = sz.w + 'px'; // Resizes the canvas inner container width
    inner.style.height = sz.h + 'px'; // Resizes the canvas inner container height
    svg.setAttribute('width', sz.w); // Updates the SVG element's width attribute
    svg.setAttribute('height', sz.h); // Updates the SVG element's height attribute
    const wrap = inner.parentElement; // Gets the scrollable canvas wrapper
    const body = wrap?.parentElement; // Gets the project card body element
    if (body) body.style.maxHeight = (sz.h + 10) + 'px'; // Expands or shrinks the card body to fit the new canvas height
    proj.nodes.forEach(node => {
        const el = inner.querySelector(`[data-nid="${node.node_id}"]`); // Finds the rendered node element by its node ID
        if (el) { el.style.left = node.x+'px'; el.style.top = node.y+'px'; } // Moves the node element to its new position
    });
    renderConnections(proj, svg, inner); // Redraws all connection lines on the SVG layer
}

// --- Connection Graph Rendering ---
function renderConnections(proj, svg, inner) {
    // Draws all connection edges as SVG paths on the canvas and adds proximity-based delete buttons.
    // Cleans up old hover listeners before attaching new ones to avoid memory leaks on re-renders.
    inner.querySelectorAll('.conn-del-html').forEach(el => el.remove()); // Removes all existing connection delete buttons
    while (svg.firstChild) svg.removeChild(svg.firstChild); // Clears all existing SVG path elements

    // Remove old hover listeners before adding new ones to prevent stale closures
    const existing = connHoverListeners.get(inner); // Gets the previously stored listener references for this canvas
    if (existing) {
        inner.removeEventListener('mousemove', existing.onMove); // Removes the old mousemove listener
        inner.removeEventListener('mouseleave', existing.onLeave); // Removes the old mouseleave listener
    }

    const onMove = e => {
        // Shows or hides connection delete buttons based on mouse proximity to their midpoints.
        const cr = inner.getBoundingClientRect(); // Gets the canvas element's position on screen
        const cx = e.clientX - cr.left, cy = e.clientY - cr.top; // Converts mouse position to canvas-local coordinates
        inner.querySelectorAll('.conn-del-html').forEach(btn => {
            const near = Math.hypot(cx - parseFloat(btn.style.left), cy - parseFloat(btn.style.top)) < 36; // Checks if the mouse is within 36px of this button's midpoint
            btn.style.opacity = near ? '1' : '0'; // Shows the button if near, hides it if far
            btn.style.pointerEvents = near ? 'all' : 'none'; // Enables or disables click events based on visibility
        });
    };

    const onLeave = () => {
        // Hides all connection delete buttons when the mouse leaves the canvas area.
        inner.querySelectorAll('.conn-del-html').forEach(btn => {
            btn.style.opacity = '0'; // Hides the button
            btn.style.pointerEvents = 'none'; // Disables click events while hidden
        });
    };

    connHoverListeners.set(inner, { onMove, onLeave }); // Stores the new listener references so they can be removed on the next re-render
    inner.addEventListener('mousemove', onMove); // Attaches the proximity-based show/hide logic
    inner.addEventListener('mouseleave', onLeave); // Attaches the hide-all logic for mouse leaving the canvas

    (proj.connections || []).forEach(conn => {
        const fn = proj.nodes.find(n => n.node_id === conn.from); // Finds the source node for this connection
        const tn = proj.nodes.find(n => n.node_id === conn.to); // Finds the target node for this connection
        if (!fn || !tn || fn.x === undefined) return; // Skips connections where either node hasn't been laid out yet

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); // Creates an SVG path element for the connection line
        path.setAttribute('d', edgePath(fn, tn)); // Sets the path data using the computed Bézier curve
        path.classList.add('conn-path'); // Applies the connection path CSS class for styling
        path.style.stroke = proj.accent_colour; // Colours the connection line with the project's accent colour
        svg.appendChild(path); // Adds the path to the SVG layer

        const mid = midPt(fn, tn); // Calculates the midpoint of the connection for placing the delete button
        const delBtn = document.createElement('button'); // Creates the HTML delete button element
        delBtn.className = 'conn-del-html'; // Applies the connection delete button CSS class
        delBtn.title = 'Delete Connection'; // Sets the tooltip
        delBtn.innerHTML = `<i class="ti ti-x" style="font-size:9px;line-height:1"></i>`; // Adds a small X icon
        delBtn.style.left = `${mid.x}px`; // Positions the button horizontally at the connection midpoint
        delBtn.style.top  = `${mid.y}px`; // Positions the button vertically at the connection midpoint
        delBtn.addEventListener('click', async e => {
            e.stopPropagation(); // Prevents the click from bubbling up to node selection handlers
            const api = getApi(); // Gets the pywebview API reference
            if (!api) return; // Exits if the API is not available
            try {
                await api.DELETE_CONNECTION(proj.project_id, { from: conn.from, to: conn.to }); // Deletes the connection via the backend
                proj.connections = (proj.connections||[]).filter(
                    c => !(c.from===conn.from && c.to===conn.to) // Removes the deleted connection from the in-memory project data
                );
                refreshCanvas(proj, svg, inner); // Redraws the canvas to reflect the removed connection
            } catch (err) { console.error('DELETE_CONNECTION failed:', err); } // Logs failures without crashing
        });
        inner.appendChild(delBtn); // Adds the delete button to the canvas overlay
    });
}

function startConnDrag(e, proj, node, svg, inner) {
    // Begins a connection drag operation from a node's handle, drawing a live preview Bézier curve.
    // stopPropagation prevents the click from also triggering the node-select handler on the parent element.
    e.stopPropagation(); // Stops the mousedown from bubbling to the node card's click handler
    e.preventDefault(); // Prevents text selection during the drag

    const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path'); // Creates the animated preview path element
    preview.classList.add('conn-path', 'conn-preview'); // Applies connection and preview CSS classes for styling
    preview.style.stroke = proj.accent_colour; // Colours the preview line with the project's accent colour

    const endDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); // Creates a dot at the dragging endpoint of the preview
    endDot.setAttribute('r', '5'); // Sets the dot radius
    endDot.classList.add('conn-end-dot'); // Applies the endpoint dot CSS class
    endDot.style.fill = proj.accent_colour; // Fills the dot with the project's accent colour
    endDot.style.stroke = 'var(--surface)'; // Adds a surface-coloured outline
    endDot.style.strokeWidth = '2'; // Sets the outline width

    svg.appendChild(preview); // Adds the preview path to the SVG layer
    svg.appendChild(endDot); // Adds the endpoint dot to the SVG layer

    document.body.classList.add('conn-dragging'); // Applies a global CSS class to change the cursor during dragging
    connDrag = { proj, fromNode: node, nodeId: node.node_id, svg, inner, preview, endDot }; // Stores the drag state including source node and SVG references
    document.addEventListener('mousemove', onConnMove); // Starts tracking mouse movement to update the preview
    document.addEventListener('mouseup', onConnEnd); // Listens for mouse release to complete or cancel the connection
}

function onConnMove(e) {
    // Updates the connection preview path and endpoint dot as the mouse moves during a connection drag.
    if (!connDrag) return; // Exits if no connection drag is in progress
    const { fromNode, inner, preview, endDot } = connDrag; // Destructures the drag state
    const cr = inner.getBoundingClientRect(); // Gets the canvas element's position on screen
    const ox = fromNode.x + NW, oy = fromNode.y + NODE_H / 2; // Gets the source node's output connection point
    const x2 = e.clientX - cr.left, y2 = e.clientY - cr.top; // Converts the mouse position to canvas-local coordinates
    const dx = Math.max(Math.abs(x2 - ox) * 0.5, 50); // Calculates the Bézier handle length proportional to the distance
    preview.setAttribute('d', `M ${ox} ${oy} C ${ox+dx} ${oy} ${x2-dx} ${y2} ${x2} ${y2}`); // Updates the preview curve from the source to the current mouse position
    endDot.setAttribute('cx', x2); // Moves the endpoint dot to the current mouse X position
    endDot.setAttribute('cy', y2); // Moves the endpoint dot to the current mouse Y position
}

async function onConnEnd(e) {
    // Completes or cancels a connection drag when the mouse button is released.
    // Creates a new connection if the mouse is released over a valid target node.
    document.removeEventListener('mousemove', onConnMove); // Stops tracking mouse movement
    document.removeEventListener('mouseup', onConnEnd); // Removes this listener after it fires
    document.body.classList.remove('conn-dragging'); // Restores the default cursor
    if (!connDrag) return; // Exits if no drag was in progress
    const { proj, nodeId, svg, inner, preview, endDot } = connDrag; // Destructures the drag state
    preview.remove(); // Removes the preview path from the SVG
    endDot.remove(); // Removes the endpoint dot from the SVG
    connDrag = null; // Clears the drag state

    const target = e.target.closest('[data-nid]'); // Finds the node element that the mouse was released over
    if (!target) return; // Exits if the release was not over any node
    const toNid = target.dataset.nid; // Gets the target node's ID
    const toPid = target.dataset.pid; // Gets the target node's project ID
    if (toNid === nodeId || toPid !== proj.project_id) return; // Cancels if connecting to self or to a node in a different project
    if ((proj.connections || []).some(c => c.from === nodeId && c.to === toNid)) return; // Cancels if this connection already exists

    const api = getApi(); // Gets the pywebview API reference
    if (!api) return; // Exits if the API is not available
    try {
        const conn = await api.CREATE_CONNECTION(proj.project_id, nodeId, toNid); // Creates the new connection via the backend
        if (conn) {
            proj.connections = proj.connections || []; // Initialises the connections array if needed
            proj.connections.push(conn); // Adds the new connection to the in-memory project data
            refreshCanvas(proj, svg, inner); // Redraws the canvas to show the new connection
        }
    } catch (err) { console.error('CREATE_CONNECTION failed:', err); } // Logs failures without crashing
}


// --- Sidebar ---
async function selectNode(projectId, nodeId) {
    // Selects or deselects a node in the canvas, loading its notes and updating the sidebar.
    // Clicking the same node again deselects it and collapses the sidebar.
    if (selPid === projectId && selNid === nodeId) { // If the same node is clicked again
        selPid = null; selNid = null; sbNotes = ''; sbMdEdit = false; // Deselects the node and clears the sidebar state
    } else { // A new or different node is being selected
        selPid = projectId; selNid = nodeId; // Stores the selected project and node IDs
        selSbTab = 'notes'; sbMdEdit = false; sbNotes = ''; // Resets the sidebar to the notes tab in preview mode
        const api = getApi(); // Gets the pywebview API reference
        if (api) {
            try { sbNotes = (await api.GET_NODE_NOTES(projectId, nodeId)) || ''; } // Fetches the node's markdown notes from the backend
            catch (_) { sbNotes = ''; } // Defaults to empty notes if the fetch fails
        }
    }
    document.querySelectorAll('.node-card').forEach(c => {
        c.classList.toggle('node-card-sel', c.dataset.pid === selPid && c.dataset.nid === selNid); // Applies the selected highlight only to the currently selected node card
    });
    renderSidebar(); // Re-renders the sidebar to show the selected node's content
}

function buildNotesPanel(panel, node) {
    // Builds either the notes edit textarea or the Markdown preview, depending on the current sbMdEdit state.
    if (sbMdEdit) { // Edit mode — shows a textarea for the user to write Markdown
        panel.innerHTML = `<div class="md-wrap"><textarea class="sb-ta"></textarea><button class="md-fab" title="Save notes"><i class="ti ti-check"></i></button></div>`;
        const ta = panel.querySelector('.sb-ta'); // Gets the textarea element
        ta.value = sbNotes; // Pre-fills the textarea with the current notes content
        ta.addEventListener('input', () => { sbNotes = ta.value; }); // Syncs the in-memory notes state as the user types
        setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 20); // Focuses the textarea and places the cursor at the end after a short delay
        panel.querySelector('.md-fab').addEventListener('click', async () => {
            const api = getApi(); // Gets the pywebview API reference
            if (!api) return; // Exits if the API is not available
            // Python parses the Markdown, validates the date, updates the node, and returns it.
            // If the date line has an invalid value it returns null — show an error and stop.
            const updated = await api.SET_NODE_NOTES(selPid, selNid, sbNotes).catch(() => null); // Saves the notes and gets the updated node back from the backend
            if (!updated) { // If the backend returned null (e.g. invalid date in the notes)
                const fab = panel.querySelector('.md-fab'); // Gets the save button
                fab.classList.add('error'); // Applies the error state CSS class to the button
                setTimeout(() => fab.classList.remove('error'), 1500); // Removes the error state after 1.5 seconds
                return; // Stops without switching to preview mode
            }
            node.node_name   = updated.node_name; // Updates the in-memory node name with any changes parsed from the notes
            node.description = updated.description || ''; // Updates the in-memory description
            node.date        = updated.date; // Updates the in-memory date
            const proj = PROJECTS.find(p => p.project_id === selPid); // Finds the parent project
            if (proj) proj.nodes.sort((a, b) => (a.date || '').localeCompare(b.date || '')); // Re-sorts the project's nodes by date after a potential date change
            sbMdEdit = false; // Switches back to preview mode
            renderProjectGrid(); // Re-renders the project grid to reflect any name or date changes
        });
    } else { // Preview mode — renders the Markdown as HTML
        const html = renderMd(sbNotes); // Converts the raw Markdown to HTML
        panel.innerHTML = `<div class="md-wrap"><div class="md-preview">${html || '<p class="md-empty">No notes yet — click edit to add some.</p>'}</div><button class="md-fab" title="Edit notes"><i class="ti ti-pencil"></i></button></div>`;
        panel.querySelector('.md-fab').addEventListener('click', () => {
            if (node.date && !/^\*\*Date:\*\*/m.test(sbNotes)) { // If the node has a date but it's not yet in the notes
                sbNotes = /^# .+/m.test(sbNotes)
                    ? sbNotes.replace(/^(# .+)$/m, `$1\n**Date:** ${node.date}`) // Inserts the date line after the first heading
                    : `**Date:** ${node.date}\n\n${sbNotes}`.trimEnd(); // Prepends the date line if there's no heading
            }
            sbMdEdit = true; // Switches to edit mode
            renderSidebar(); // Re-renders the sidebar in edit mode
        });
    }
}

function buildFilesPanel(panel, node) {
    // Builds the files tab panel showing attached file chips and an attach button.
    const files = node.files || []; // Gets the list of filenames attached to this node
    if (files.length) { // If there are files attached
        const wrap = document.createElement('div'); // Creates a wrapper for the file chips
        wrap.style.marginBottom = '8px'; // Adds spacing below the chip list
        files.forEach(f => { // Loops over each attached filename
            const chip = document.createElement('span'); // Creates a chip element for this file
            chip.className = 'sb-file-chip'; // Applies the file chip CSS class
            chip.innerHTML = `${f}<button class="sb-file-remove" title="Remove file" data-filename="${f}">×</button>`; // Renders the filename with a remove button
            chip.querySelector('.sb-file-remove').addEventListener('click', async () => {
                const api = getApi(); // Gets the pywebview API reference
                if (!api) return; // Exits if the API is not available
                try {
                    const res = await api.REMOVE_FILE_FROM_NODE(selPid, selNid, f); // Removes the file association via the backend
                    showToast(res.message, res.error); // Shows a success or error toast with the backend's message
                    if (!res.error) { // If the removal was successful
                        const p = PROJECTS.find(pr => pr.project_id === selPid); // Finds the parent project
                        const n = p?.nodes?.find(nd => nd.node_id === selNid); // Finds the node
                        if (n) n.files = res.files; // Updates the node's file list with the backend's updated list
                        renderSidebar(); // Re-renders the sidebar to remove the chip
                    }
                } catch (e) { console.error('REMOVE_FILE_FROM_NODE failed:', e); } // Logs failures without crashing
            });
            wrap.appendChild(chip); // Adds the file chip to the wrapper
        });
        panel.innerHTML = ''; // Clears the panel before adding chips
        panel.appendChild(wrap); // Adds the chips wrapper to the panel
    } else {
        panel.innerHTML = `<span style="font-size:12px;color:var(--text-faint);font-style:italic">No files attached yet</span>`; // Shows a placeholder if no files are attached
    }

    const addBtn = document.createElement('button'); // Creates the attach files button
    addBtn.className = 'sb-add'; // Applies the add button CSS class
    addBtn.innerHTML = `<i class="ti ti-paperclip" style="font-size:12px"></i> Attach files`; // Sets the button label with a paperclip icon
    addBtn.addEventListener('click', async () => {
        const api = getApi(); // Gets the pywebview API reference
        if (!api) return; // Exits if the API is not available
        try {
            const res = await api.ADD_FILE_TO_NODE(selPid, selNid); // Opens the native file picker and attaches the selected files via the backend
            showToast(res.message, res.error); // Shows a success or error toast
            if (res && !res.error) { // If files were successfully added
                const p = PROJECTS.find(pr => pr.project_id === selPid); // Finds the parent project
                const n = p?.nodes?.find(nd => nd.node_id === selNid); // Finds the node
                if (n) n.files = res.files; // Updates the node's file list
                renderSidebar(); // Re-renders the sidebar to show the new file chips
            }
        } catch (e) { console.error('ADD_FILE_TO_NODE failed:', e); } // Logs failures without crashing
    });
    panel.appendChild(addBtn); // Adds the attach button below the file chips
}

function buildDetailsPanel(panel, proj, node) {
    // Builds the details tab panel showing the node's project, date, description, and a delete button.
    panel.innerHTML = `
        <div class="sb-dr"><span class="sb-dk">Project</span><span class="sb-dv">${proj.project_name}</span></div>
        <div class="sb-dr"><span class="sb-dk">Date</span><span class="sb-dv">${fmtDate(node.date)}</span></div>
        <div class="sb-dr"><span class="sb-dk">Description</span><span class="sb-dv">${node.description || '—'}</span></div>
        <button class="sb-del-btn"><i class="ti ti-trash" style="font-size:12px"></i> Delete revision</button>`; // Renders the node details and a delete button
    panel.querySelector('.sb-del-btn').addEventListener('click', async () => {
        const api = getApi(); // Gets the pywebview API reference
        if (!api) return; // Exits if the API is not available
        try {
            await api.DELETE_NODE(selPid, selNid); // Deletes the node via the backend
            const p = PROJECTS.find(pr => pr.project_id === selPid); // Finds the parent project
            if (p) {
                p.nodes       = p.nodes.filter(n => n.node_id !== selNid); // Removes the deleted node from the in-memory project
                p.connections = p.connections.filter(c => c.from !== selNid && c.to !== selNid); // Removes all connections that referenced the deleted node
            }
            selPid = null; selNid = null; // Clears the sidebar selection
            renderProjectGrid(); // Re-renders the project grid without the deleted node
            updateStats(); // Updates the header stats to reflect the new node count
        } catch (e) { console.error('DELETE_NODE failed:', e); } // Logs failures without crashing
    });
}

function renderSidebar() {
    // Renders the right-hand sidebar based on the current node selection and active tab.
    // Shows an empty state prompt if no node is selected.
    const sb = document.getElementById('proj-sidebar'); // Gets the sidebar container element
    if (!sb) return; // Exits if the sidebar element doesn't exist

    if (!selPid || !selNid) { // If no node is currently selected
        sb.innerHTML = `<div class="sb-empty"><i class="ti ti-hand-click" style="font-size:26px"></i><span>Click any Revision<br>to View its Details</span></div>`; // Shows the empty state prompt
        return; // Stops rendering early
    }

    const proj = PROJECTS.find(p => p.project_id === selPid); // Finds the selected project
    const node = proj?.nodes?.find(n => n.node_id === selNid); // Finds the selected node within the project
    if (!proj || !node) { selPid = null; selNid = null; renderSidebar(); return; } // Falls back to empty state if the node no longer exists

    const tabsHtml = ['notes', 'files', 'details'].map(t =>
        `<button class="sb-tab${selSbTab === t ? ' on' : ''}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>` // Renders a tab button for each panel, marking the active tab
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
        </div>`; // Renders the sidebar header, tab bar, and empty panel container

    sb.querySelectorAll('.sb-tab').forEach(btn =>
        btn.addEventListener('click', () => { selSbTab = btn.dataset.tab; sbMdEdit = false; renderSidebar(); }) // Switches tabs and resets edit mode when a tab is clicked
    );

    const panel = sb.querySelector('.sb-panel'); // Gets the panel content area
    if (selSbTab === 'notes')        buildNotesPanel(panel, node); // Builds the notes tab content
    else if (selSbTab === 'files')   buildFilesPanel(panel, node); // Builds the files tab content
    else                             buildDetailsPanel(panel, proj, node); // Builds the details tab content
}

// --- Search ---
function setPrinterSearch(value) {
    // Updates the project search query and re-renders the project grid to show only matching projects.
    _searchQuery = value.trim().toLowerCase(); // Stores the trimmed and lowercased search query
    renderProjectGrid(); // Re-renders the grid filtered by the new search query
}

function openProjectSearch() {
    // Expands the header search bar and focuses the search input.
    document.getElementById('project-actions').classList.add('search-open'); // Expands the header to show the search input
    document.getElementById('project-search').focus(); // Focuses the search input immediately
}

function closeProjectSearch() {
    // Collapses the header search bar and clears the search query.
    document.getElementById('project-actions').classList.remove('search-open'); // Collapses the header back to its default state
    document.getElementById('project-search').value = ''; // Clears the search input field
    _searchQuery = ''; // Resets the in-memory search query
    renderProjectGrid(); // Re-renders the full unfiltered project grid
}

document.getElementById('project-search-open').addEventListener('click', openProjectSearch); // Opens the search bar when the search icon is clicked
document.getElementById('project-search-close').addEventListener('click', closeProjectSearch); // Closes and clears the search bar when the X button is clicked

// --- Project Grid ---
function renderProjectGrid() {
    // Builds and inserts all visible project cards into the main grid container.
    // Applies the current search query filter before rendering.
    const grid = document.getElementById('printers-grid'); // Gets the project grid container element
    grid.innerHTML = ''; // Clears all existing project cards
    const visible = _searchQuery
        ? PROJECTS.filter(p => p.project_name.toLowerCase().includes(_searchQuery)) // Filters to projects whose names match the search query
        : PROJECTS; // Shows all projects if no search query is active
    visible.forEach(proj => grid.appendChild(buildProjectCard(proj))); // Builds and appends a card for each visible project
    renderSidebar(); // Re-renders the sidebar in case the selected node's card changed
}

function buildProjectHeader(proj) {
    // Builds the collapsible header element for a project card, including the name, description, and action buttons.
    const hdr = document.createElement('div'); // Creates the header container element
    hdr.className = 'proj-hdr'; // Applies the project header CSS class
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
        </div>`; // Renders the collapse arrow, project info, and action buttons
    hdr.querySelector('.btn-sm').addEventListener('click', e => { e.stopPropagation(); openRevisionModal(proj.project_id); }); // Opens the add revision modal without also triggering the collapse toggle
    hdr.querySelector('.icon-button').addEventListener('click', e => { e.stopPropagation(); openProjectModal(proj); }); // Opens the edit project modal without also triggering the collapse toggle
    return hdr; // Returns the completed header element
}

function buildNodeElement(proj, node, connSvg, canvasInner) {
    // Builds a draggable node card element that represents a single design revision.
    // Attaches click-to-select and connection drag handle event listeners.
    const el = document.createElement('div'); // Creates the node card element
    el.className = 'node-card' + (node.node_id === selNid && proj.project_id === selPid ? ' node-card-sel' : ''); // Applies the selected class if this node is currently selected
    el.style.cssText = `position:absolute;left:${node.x||0}px;top:${node.y||0}px;height:${NODE_H}px`; // Positions the node absolutely at its layout coordinates
    el.style.setProperty('--proj-ac', proj.accent_colour); // Exposes the project accent colour as a CSS variable for child elements
    el.dataset.pid = proj.project_id; // Stores the project ID for connection drag validation
    el.dataset.nid = node.node_id; // Stores the node ID for selection and connection targeting
    el.innerHTML = `
        <div class="node-card-name">${node.node_name}</div>
        ${node.description ? `<div class="node-card-desc">${node.description}</div>` : ''}
        <div class="node-conn-input" data-pid="${proj.project_id}" data-nid="${node.node_id}"></div>
        <div class="node-conn-handle" title="Drag to Connect"></div>`; // Renders the node name, optional description, input target area, and drag handle
    el.addEventListener('click', e => { e.stopPropagation(); selectNode(proj.project_id, node.node_id); }); // Selects this node on click without triggering the project card collapse
    el.querySelector('.node-conn-handle').addEventListener('mousedown', e => startConnDrag(e, proj, node, connSvg, canvasInner)); // Starts a connection drag from the node's right-side handle
    return el; // Returns the completed node element
}

function buildProjectCard(proj) {
    // Builds the full project card element including its header, collapsible body, and canvas with nodes and connections.
    const card = document.createElement('div'); // Creates the outer project card element
    card.className = 'proj-card' + (proj.collapsed ? ' collapsed' : ''); // Applies the collapsed class if the project is stored as collapsed
    card.dataset.id = proj.project_id; // Stores the project ID on the card element
    card.style.setProperty('--proj-ac', proj.accent_colour); // Exposes the accent colour as a CSS variable

    const hdr  = buildProjectHeader(proj); // Builds the project header element
    const body = document.createElement('div'); // Creates the collapsible body element
    body.className = 'proj-body'; // Applies the project body CSS class

    const canvasInner = document.createElement('div'); // Creates the inner canvas container for absolute-positioned nodes
    canvasInner.className = 'proj-canvas-inner'; // Applies the canvas inner CSS class

    // The SVG layer is appended first so it renders behind the node cards
    const connSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); // Creates the SVG element for drawing connection lines
    connSvg.classList.add('proj-conn-svg'); // Applies the connection SVG CSS class
    canvasInner.appendChild(connSvg); // Appends the SVG layer below where nodes will be added

    const nodes = proj.nodes || []; // Gets the list of nodes in this project
    layoutNodes(proj); // Calculates pixel positions for all nodes
    const sz = projCanvasSize(proj); // Gets the canvas dimensions needed to fit all nodes
    body.style.maxHeight = proj.collapsed ? '0' : (sz.h + 10) + 'px'; // Sets the body height to 0 if collapsed, or the full canvas height if expanded

    if (nodes.length === 0) { // If the project has no nodes yet
        const emptyMsg = document.createElement('div'); // Creates the empty state message element
        emptyMsg.className = 'proj-canvas-empty'; // Applies the empty canvas CSS class
        emptyMsg.textContent = 'No iterations yet'; // Sets the placeholder text
        canvasInner.appendChild(emptyMsg); // Adds the message to the canvas
    } else { // If there are nodes to render
        canvasInner.style.width  = sz.w + 'px'; // Sets the canvas width to fit all nodes
        canvasInner.style.height = sz.h + 'px'; // Sets the canvas height to fit all nodes
        connSvg.setAttribute('width',  sz.w); // Sets the SVG width to match the canvas
        connSvg.setAttribute('height', sz.h); // Sets the SVG height to match the canvas
        nodes.forEach(node => canvasInner.appendChild(buildNodeElement(proj, node, connSvg, canvasInner))); // Builds and appends a node element for each revision
        renderConnections(proj, connSvg, canvasInner); // Draws the connection lines between nodes
    }

    const canvasWrap = document.createElement('div'); // Creates the scrollable wrapper around the canvas
    canvasWrap.className = 'proj-canvas-wrap'; // Applies the canvas wrapper CSS class
    canvasWrap.appendChild(canvasInner); // Adds the inner canvas to the wrapper
    body.appendChild(canvasWrap); // Adds the canvas wrapper to the card body

    hdr.addEventListener('click', () => {
        // Toggles the project card between collapsed and expanded, persisting the state to the backend.
        proj.collapsed = !proj.collapsed; // Flips the collapsed state in memory
        card.classList.toggle('collapsed', proj.collapsed); // Updates the CSS class on the card element
        if (proj.collapsed) {
            body.style.maxHeight = '0'; // Collapses the body by setting max height to zero
        } else {
            layoutNodes(proj); // Recalculates node positions in case they changed while collapsed
            body.style.maxHeight = (projCanvasSize(proj).h + 10) + 'px'; // Expands the body to the full canvas height
        }
        const api = getApi(); // Gets the pywebview API reference
        if (api) api.UPDATE_PROJECT(proj.project_id, { collapsed: proj.collapsed }).catch(() => {}); // Saves the collapsed state to the backend, ignoring errors silently
    });

    card.append(hdr, body); // Assembles the card from its header and body
    return card; // Returns the completed project card element
}

async function updateStats() {
    // Fetches and displays the project statistics in the page header (total projects, iterations, files).
    const api = getApi(); // Gets the pywebview API reference
    if (!api) return; // Exits if the API bridge is not available
    try {
        const stats = await api.GET_PROJECT_STATS(); // Requests the project counts from the Python backend
        document.getElementById('stat-projects').textContent = stats.projects ?? 0; // Updates the total projects count display
        document.getElementById('stat-itterations').textContent = stats.iterations ?? 0; // Updates the total iterations count display
        document.getElementById('stat-files').textContent = stats.files ?? 0; // Updates the total attached files count display
    } catch (e) {
        console.error('GET_PROJECT_STATS failed:', e); // Logs the error without crashing the UI
    }
}

async function deleteProject(projectId) {
    // Deletes a project via the backend and removes it from the UI.
    const api = getApi(); // Gets the pywebview API reference
    if (!api) return; // Exits if the API is not available
    try {
        await api.DELETE_PROJECT(projectId); // Sends the delete request to the Python backend
        PROJECTS = PROJECTS.filter(p => p.project_id !== projectId); // Removes the deleted project from the in-memory array
        renderProjectGrid(); // Re-renders the grid without the deleted project
        updateStats(); // Updates the header stats to reflect the new project count
    } catch (e) {
        console.error('DELETE_PROJECT failed:', e); // Logs failures without crashing
    }
}

// --- Project Modal (Add and Edit) ---
// Pass a proj object to open in edit mode; pass nothing to open in add mode.
function openProjectModal(proj = null) {
    // Opens the project modal pre-populated with a project's data for editing,
    // or with blank defaults when creating a new project.
    modalMode       = proj ? 'edit' : 'add'; // Sets the modal mode based on whether a project was passed
    activeProjectId = proj?.project_id ?? null; // Stores the editing project's ID, or null for a new project

    document.getElementById('printer-modal-title').textContent = proj ? 'EDIT PROJECT' : 'NEW PROJECT'; // Sets the modal title based on the current mode
    document.getElementById('printer-confirm').textContent     = proj ? 'Save Changes'  : 'Add Project'; // Sets the confirm button label based on the current mode
    document.getElementById('printer-remove').style.display   = proj ? ''      : 'none'; // Shows or hides the remove button based on mode

    document.getElementById('p-name').value = proj?.project_name ?? ''; // Pre-fills the name field with the project's name
    document.getElementById('p-name').classList.remove('input-error'); // Clears any previous name error highlight
    document.getElementById('p-description').value = proj?.description ?? ''; // Pre-fills the description field
    document.getElementById('ai-user-prompt').value = ''; // Clears the AI prompt field
    document.getElementById('ai-btn-wrap').classList.remove('generating', 'error', 'ready'); // Resets the AI button state
    document.getElementById('ai-generate-btn').classList.remove('error', 'ready'); // Resets the AI generate button state

    pickColour(proj?.accent_colour ?? COLOURS[0].hex); // Sets the colour picker to the project's accent colour or the default
    document.getElementById('printer-modal').classList.add('open'); // Opens the project modal
}

function closeProjectModal() {
    // Closes the project modal and ensures the colour picker is also closed.
    closeColourPicker(); // Closes the colour picker if it was left open
    document.getElementById('printer-modal').classList.remove('open'); // Hides the project modal
}

// --- Revision Modal ---
let activeRevisionProjectId = null; // Stores the ID of the project a new revision is being added to

function openRevisionModal(projectId) {
    // Opens the revision modal for the specified project, resetting all fields to blank.
    activeRevisionProjectId = projectId; // Stores the parent project ID for the new revision

    document.getElementById('r-name').value = ''; // Clears the revision name field
    document.getElementById('r-name').classList.remove('input-error'); // Clears any previous name error highlight
    document.getElementById('r-description').value = ''; // Clears the description field
    document.getElementById('r-ai-prompt').value = ''; // Clears the AI prompt field
    document.getElementById('r-ai-btn-wrap').classList.remove('generating', 'error', 'ready'); // Resets the AI button wrapper state
    document.getElementById('r-ai-generate-btn').classList.remove('error', 'ready'); // Resets the AI generate button state

    document.getElementById('revision-modal').classList.add('open'); // Opens the revision modal
}

function closeRevisionModal() {
    // Closes the revision modal and clears the active project ID.
    document.getElementById('revision-modal').classList.remove('open'); // Hides the revision modal
    activeRevisionProjectId = null; // Clears the stored project ID
}

async function confirmRevisionModal() {
    // Validates the revision form, checks for duplicate names, and creates the new revision via the backend.
    const proj = PROJECTS.find(p => p.project_id === activeRevisionProjectId); // Finds the parent project
    const existingNames = (proj?.nodes || []).map(n => n.node_name.toLowerCase()); // Builds a list of existing revision names for uniqueness validation
    const name = validateUniqueName('r-name', existingNames, 'A revision with this name already exists'); // Validates that the name is non-empty and unique
    if (!name) return; // Stops if validation failed

    const description = document.getElementById('r-description').value.trim(); // Gets the revision description
    const api = getApi(); // Gets the pywebview API reference
    if (!api) { showToast('API not ready', true); return; } // Stops if the API is not available
    try {
        const node = await api.CREATE_NODE(activeRevisionProjectId, name, description); // Creates the new revision node via the backend
        if (proj) {
            if (!proj.nodes) proj.nodes = []; // Initialises the nodes array if the project has none yet
            proj.nodes.push(node); // Adds the new node to the in-memory project
        }
        renderProjectGrid(); // Re-renders the project grid to show the new node
        closeRevisionModal(); // Closes the modal after successful creation
    } catch (e) { console.error('CREATE_NODE failed:', e); } // Logs failures without crashing
}

function generateRevisionWithAI() {
    // Triggers AI generation for the revision name and description fields using the revision prompt.
    return generateAI({ promptId: 'r-ai-prompt', btnId: 'r-ai-generate-btn', apiMethod: 'GENERATE_REVISION_DETAILS', nameId: 'r-name', descId: 'r-description' });
}

function validateUniqueName(inputId, existingNames, toastMsg) {
    // Validates that an input field is non-empty and its value is not already in the existing names list.
    // Returns the trimmed name if valid, or null after showing an error if invalid.
    const el = document.getElementById(inputId); // Gets the input element to validate
    const name = el.value.trim(); // Gets and trims the current input value
    if (!name) { el.focus(); return null; } // Focuses the field and stops if the name is empty
    if (existingNames.includes(name.toLowerCase())) { // Checks if the name already exists (case-insensitive)
        el.classList.add('input-error'); // Highlights the input field with an error style
        el.focus(); // Focuses the field to draw the user's attention
        showToast(toastMsg, true); // Shows the provided error message as a toast
        return null; // Returns null to signal validation failure
    }
    return name; // Returns the valid trimmed name
}

// --- Confirm (Add and Edit) ---
async function confirmProjectModal() {
    // Validates the project form and calls the backend to either create a new project or update an existing one.
    const existingNames = PROJECTS
        .filter(p => modalMode !== 'edit' || p.project_id !== activeProjectId) // Excludes the currently edited project from the uniqueness check
        .map(p => p.project_name.toLowerCase()); // Builds a lowercase list of existing project names
    const name = validateUniqueName('p-name', existingNames, 'A project with this name already exists'); // Validates the name is non-empty and unique
    if (!name) return; // Stops if validation failed

    const description = document.getElementById('p-description').value.trim(); // Gets the project description
    const api = getApi(); // Gets the pywebview API reference
    if (!api) { showToast('API not ready', true); return; } // Stops if the API is not available

    if (modalMode === 'edit') { // Edit mode — updates the existing project
        try {
            const updated = await api.UPDATE_PROJECT(activeProjectId, { project_name: name, description, accent_colour: selectedAccentColour }); // Sends the updated project data to the backend
            const idx = PROJECTS.findIndex(p => p.project_id === activeProjectId); // Finds the project's index in the local array
            if (idx !== -1 && updated) PROJECTS[idx] = updated; // Replaces the local project object with the backend's updated version
            renderProjectGrid(); // Re-renders to show the updated project
            closeProjectModal(); // Closes the modal after saving
        } catch (err) { console.error('UPDATE_PROJECT failed:', err); } // Logs failures without crashing
    } else { // Add mode — creates a new project
        try {
            const proj = await api.CREATE_PROJECT(name, selectedAccentColour, description); // Creates the new project via the backend
            PROJECTS.push(proj); // Adds the new project to the in-memory array
            renderProjectGrid(); // Re-renders to show the new project card
            updateStats(); // Updates the header stats to reflect the new project count
            closeProjectModal(); // Closes the modal after creation
        } catch (err) { console.error('CREATE_PROJECT failed:', err); } // Logs failures without crashing
    }
}

// --- Remove ---
async function removeProjectFromModal() {
    // Deletes the currently edited project via the backend and removes it from the UI.
    if (!activeProjectId) return; // Exits if no project is currently being edited

    const api = getApi(); // Gets the pywebview API reference
    if (!api) return; // Exits if the API is not available
    try {
        await api.DELETE_PROJECT(activeProjectId); // Sends the delete request to the Python backend
        PROJECTS = PROJECTS.filter(p => p.project_id !== activeProjectId); // Removes the deleted project from the in-memory array
        renderProjectGrid(); // Re-renders the grid without the deleted project
        updateStats(); // Updates the header stats to reflect the removed project
        closeProjectModal(); // Closes the modal after deletion
    } catch (err) {
        console.error('DELETE_PROJECT failed:', err); // Logs the failure without crashing
    }
}

// --- Boot ---
async function loadProjects() {
    // Fetches all projects from the backend and renders the initial UI.
    // Retries up to 5 times with a short delay to handle the pywebview bridge initialising asynchronously.
    let api = null;
    for (let attempt = 0; attempt < 5; attempt++) { // Tries up to 5 times to get the API bridge
        api = getApi(); // Attempts to get the API reference
        if (api) break; // Stops retrying once the bridge is available
        await new Promise(resolve => setTimeout(resolve, 250)); // Waits 250ms before the next attempt
    }
    if (!api) return; // Exits if the API bridge never became available

    try {
        PROJECTS = await api.LIST_PROJECTS() || []; // Fetches all projects from the backend, defaulting to an empty array
    } catch (e) {
        console.error('LIST_PROJECTS failed:', e); // Logs the error without crashing
        PROJECTS = []; // Resets to an empty array so the UI still renders
    }
    renderProjectGrid(); // Renders the project grid with the loaded data
    updateStats(); // Populates the header stats bar
}

renderSidebar(); // Renders the empty sidebar state immediately on page load

// Load all projects, handling the pywebview bridge potentially not being ready yet
if (window.pywebview) {
    loadProjects(); // Loads immediately if the bridge is already available
} else {
    window.addEventListener('pywebviewready', () => loadProjects()); // Loads when the bridge becomes ready
    // Fallback: pywebviewready may not propagate into iframes — retry covers this edge case
    setTimeout(() => { if (PROJECTS.length === 0) loadProjects(); }, 500); // Retries after 500ms if no projects have loaded yet
}
