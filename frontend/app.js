// PRE-LOAD THE YARD COORDINATES (Unified Junctions!)
/* let nodeCoords = {
    // Western Line Hubs
    "ANDHERI":      { x: 350, y: 500 },
    "CHURCHGATE":   { x: 650, y: 500 },

    // Central Line Hubs
    "KASARA":       { x: 50,  y: 300 },
    "KALYAN":       { x: 200, y: 320 }, // Junction
    "THANE":        { x: 300, y: 340 }, // Junction
    "DADAR":        { x: 500, y: 440 }, // Mega Junction (Central + Western)
    "CST":          { x: 650, y: 380 }, // Mega Terminal (Central + Harbour)

    // Harbour / Trans-Harbour Hubs
    "PANVEL":       { x: 300, y:  50 }, // Junction
    "VASHI":        { x: 400, y: 100 },
    "KURLA":        { x: 520, y: 200 }, // Junction
    "NERUL":        { x: 420, y: 150 },

    // Extended Mainline (Mumbai–Pune)
    "KARJAT":       { x: 800, y: 360 }, // Junction
    "KHOPOLI":      { x: 850, y: 450 }, // Branch end
    "LONAVALA":     { x: 900, y: 300 },
    "TALEGAON":     { x: 980, y: 260 },
    "SHIVAJINAGAR": { x:1060, y: 230 },
    "PUNE":         { x:1150, y: 200 }
};

// Tracks that should show a crossover diamond (track-changing point)
// Specify the mid-point fraction (0–1) along the track where the crossover sits
// Tracks that should show a crossover diamond
const CROSSOVER_TRACKS = new Set([
    "KALYAN|THANE",
    "THANE|DADAR",
    "DADAR|CST",
    "KARJAT|LONAVALA",
    "LONAVALA|TALEGAON",
    "VASHI|KURLA",
    "ANDHERI|DADAR"
]);

const activeTrains   = {};
const activeTracks   = {};   // trackId → { up, dn } DOM elements
const activeSignals  = {};   // trackId → { up, dn } DOM elements
// trackMeta stores the canonical src/tgt so we can derive direction per-train
const trackMeta      = {};   // trackId → { src, tgt }
let selectedStationId = null;

const mapContainer = document.getElementById('map-container');
const eventLog     = document.getElementById('event-log');

// ── WebSocket ────────────────────────────────────────────
const ws = new WebSocket('ws://localhost:8080/ws');

function logEvent(msg, color = "#8aabcf") {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const div  = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `<span style="color:#3a5a80">[${time}]</span> <span style="color:${color}">${msg}</span>`;
    eventLog.prepend(div);
    // keep log trimmed
    while (eventLog.children.length > 80) eventLog.lastChild.remove();
}

ws.onopen  = () => {
    document.getElementById('status').innerText = 'SYS.ONLINE';
    document.getElementById('status').style.color = 'var(--text-ok)';
    logEvent('WebSocket connected.', 'var(--text-ok)');
};
ws.onclose = () => {
    document.getElementById('status').innerText = 'SYS.OFFLINE';
    document.getElementById('status').style.color = 'var(--text-danger)';
    logEvent('WebSocket closed.', 'var(--text-danger)');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if      (data.type === 'MAP_LAYOUT')   buildMap(data.stations, data.tracks);
    else if (data.type === 'STATE_UPDATE') updateState(data);
    else if (data.type === 'ESTOP_STATE')  handleEStop(data.state);
};

// ── Manual clock ──────────────────────────────────────────
function setManualTime() {
    const v = document.getElementById('manual-time').value;
    if (!v) return;
    const [h, m] = v.split(':').map(Number);
    ws.send(JSON.stringify({ action: 'SET_TIME', hour: h, minute: m }));
    logEvent(`Clock set → ${v}`, 'var(--text-warn)');
}

function toggleSimulation() {
    ws.send(JSON.stringify({ action: 'TOGGLE_SIMULATION' }));
}

function resetSimulation() {
    if(confirm("⚠ WARNING: This will wipe all trains and reset the clock. Proceed?")) {
        ws.send(JSON.stringify({ action: 'RESET_SIMULATION' }));
        document.getElementById('schedule-board').innerHTML = ''; // Clear the board visually
        logEvent("SYSTEM RESET EXECUTED.", "#ff4444");
    }
}

// ── Demo yard builder ─────────────────────────────────────
function loadDemoMap() {
    logEvent('INITIALIZING AUTOMATED YARD BUILD…', 'var(--text-warn)');
    Object.keys(nodeCoords).forEach(id =>
        ws.send(JSON.stringify({ action: 'ADD_STATION', id, name: id }))
    );

    setTimeout(() => {
        const tracks = [
            // Western Line
            ["ANDHERI", "DADAR"],
            ["DADAR",   "CHURCHGATE"],
            // Central Line
            ["KASARA",  "KALYAN"],
            ["KALYAN",  "THANE"],
            ["THANE",   "DADAR"],
            ["DADAR",   "CST"],
            // Harbour Line
            ["PANVEL",  "VASHI"],
            ["VASHI",   "KURLA"],
            ["KURLA",   "CST"],
            // Trans-Harbour
            ["THANE",   "NERUL"],
            ["NERUL",   "PANVEL"],
            // Karjat Branch & Mainline to Pune
            ["KALYAN",  "KARJAT"],
            ["KARJAT",  "KHOPOLI"],
            ["KARJAT",  "LONAVALA"],
            ["LONAVALA","TALEGAON"],
            ["TALEGAON","SHIVAJINAGAR"],
            ["SHIVAJINAGAR","PUNE"]
        ];
        
        tracks.forEach(t => {
            const dx  = nodeCoords[t[1]].x - nodeCoords[t[0]].x;
            const dy  = nodeCoords[t[1]].y - nodeCoords[t[0]].y;
            const len = Math.floor(Math.hypot(dx, dy) / 2);
            ws.send(JSON.stringify({ action: 'ADD_TRACK', src: t[0], tgt: t[1], length: len }));
        });
        logEvent('YARD BUILD COMPLETE.', 'var(--text-ok)');
    }, 500);
}

// ── Modals ────────────────────────────────────────────────
let tempX = 0, tempY = 0;

function closeModals() {
    document.getElementById('build-modal').style.display    = 'none';
    document.getElementById('dispatch-modal').style.display = 'none';
    document.getElementById('track-modal').style.display    = 'none'; // NEW
    document.getElementById('new-station-id').value = '';
}
mapContainer.addEventListener('click', (e) => {
    if (e.target !== mapContainer) return;
    tempX = e.clientX;
    tempY = e.clientY - 52;   // subtract header height
    document.getElementById('build-modal').style.display = 'flex';
    document.getElementById('new-station-id').focus();
});

function submitStation() {
    const sid = document.getElementById('new-station-id').value.toUpperCase();
    if (!sid) return;
    nodeCoords[sid] = { x: tempX, y: tempY };
    ws.send(JSON.stringify({ action: 'ADD_STATION', id: sid, name: sid }));
    closeModals();
}

function submitDispatch() {
    const src  = document.getElementById('disp-src').value;
    const tgt  = document.getElementById('disp-tgt').value.toUpperCase();
    const name = document.getElementById('disp-name').value || 'TRN-' + Math.floor(Math.random() * 1000);
    const type = document.getElementById('disp-type').value;
    const tv   = document.getElementById('disp-time').value;
    if (!tv) return alert('Please set a scheduled time!');
    const [h, m] = tv.split(':').map(Number);

    ws.send(JSON.stringify({ action: 'SMART_DISPATCH', src, tgt, type, name, sched_hour: h, sched_min: m }));
    closeModals();

    const board = document.getElementById('schedule-board');
    const entry = document.createElement('div');
    entry.id = `sched-${name}`;
    entry.className = 'sched-entry';
    entry.innerHTML =
        `⏳ <b style="color:var(--text-warn)">${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}</b>`
        + ` &nbsp;${name} <span style="color:var(--text-dim)">(${type})</span><br>`
        + `&nbsp;&nbsp;↳ ${src} → ${tgt}`;
    board.appendChild(entry);

    logEvent(`[${name}] Queued @ ${tv}.`, 'var(--text-accent)');
}

function submitTrack() {
    const src = document.getElementById('trk-src').value;
    const tgt = document.getElementById('trk-tgt').value;
    const len = parseInt(document.getElementById('trk-len').value) || 50;
    const mode = document.getElementById('trk-mode').value;

    ws.send(JSON.stringify({ action: 'ADD_TRACK', src: src, tgt: tgt, length: len, mode: mode }));
    closeModals();
    logEvent(`Laying ${mode} track from ${src} to ${tgt}...`, "#38bdf8");
}

// ── E-Stop ────────────────────────────────────────────────
let isEStopActive = false;
function toggleEStop() {
    isEStopActive = !isEStopActive;
    ws.send(JSON.stringify({ action: 'E_STOP', state: isEStopActive }));
}
function handleEStop(state) {
    const overlay = document.getElementById('estop-overlay');
    const btn     = document.getElementById('estop-btn');
    if (state) {
        overlay.style.display = 'block';
        btn.className = 'ctrl-btn btn-estop-active';
        btn.innerText = '■ RELEASE E-STOP';
        logEvent('SYSTEM HALTED BY DISPATCHER', 'var(--text-danger)');
    } else {
        overlay.style.display = 'none';
        btn.className = 'ctrl-btn btn-estop';
        btn.innerText = '⚠ EMERGENCY STOP';
        logEvent('SYSTEM RESUMED', 'var(--text-ok)');
    }
}

// right-click: sabotage track or delete station
mapContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target.classList.contains('track-up') || e.target.classList.contains('track-dn')) {
        const id = e.target.dataset.id;
        // mark both rails broken
        const pair = activeTracks[id];
        if (pair) {
            pair.up && pair.up.classList.add('broken');
            pair.dn && pair.dn.classList.add('broken');
        }
        logEvent(`TRACK ${id} SABOTAGED.`, 'var(--text-warn)');
        ws.send(JSON.stringify({ action: 'SABOTAGE_TRACK', id }));
    } else if (e.target.classList.contains('station')) {
        ws.send(JSON.stringify({ action: 'DELETE_STATION', id: e.target.dataset.id }));
    }
});

// ═══════════════════════════════════════════════════════
//  CORE RENDERING HELPERS
// ═══════════════════════════════════════════════════════

function perpOffset(dx, dy, gap) {
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { px: (-dy / len) * gap, py: (dx / len) * gap };
}

function makeRail(cls, src, tgt, offsetX, offsetY, trackId, isBroken) {
    const sx = src.x + offsetX, sy = src.y + offsetY;
    const tx = tgt.x + offsetX, ty = tgt.y + offsetY;
    const dx = tx - sx, dy = ty - sy;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle  = Math.atan2(dy, dx) * 180 / Math.PI;

    const MARGIN = 13;   // clear the larger station dot (20px diameter → 10px radius + padding)
    const drawLen = Math.max(0, length - MARGIN * 2);

    const el = document.createElement('div');
    el.className = cls + (isBroken ? ' broken' : '');
    el.dataset.id = trackId;
    el.style.width     = `${drawLen}px`;
    el.style.left      = `${sx + Math.cos(angle * Math.PI / 180) * MARGIN}px`;
    el.style.top       = `${sy + Math.sin(angle * Math.PI / 180) * MARGIN}px`;
    el.style.transform = `translate(0, -50%) rotate(${angle}deg)`;
    mapContainer.appendChild(el);
    return el;
}


function makeArrow(src, tgt, offsetX, offsetY, upDirection) {
    const MID = 0.5;
    const mx = (src.x + tgt.x) / 2 + offsetX;
    const my = (src.y + tgt.y) / 2 + offsetY;
    const dx = tgt.x - src.x, dy = tgt.y - src.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    const el = document.createElement('div');
    el.className  = 'track-arrow';
    el.style.left = `${mx}px`;
    el.style.top  = `${my}px`;
    el.style.transform = `translate(-50%, -50%) rotate(${upDirection ? angle : angle + 180}deg)`;
    // SVG triangle arrow
    el.innerHTML =
        `<svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">`
        + `<path d="M0 4L10 4M6 1L10 4L6 7" stroke="rgba(56,189,248,0.6)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`
        + `</svg>`;
    mapContainer.appendChild(el);
    return el;
}

function makeSignal(srcX, srcY, tgtX, tgtY, trackId, railClass) {
    const dx    = tgtX - srcX, dy = tgtY - srcY;
    const len   = Math.sqrt(dx * dx + dy * dy) || 1;
    const angle = Math.atan2(dy, dx);
    const POS   = 0.18;  // 18% along the track from src
    const sx    = srcX + Math.cos(angle) * len * POS;
    const sy    = srcY + Math.sin(angle) * len * POS;

    const el = document.createElement('div');
    el.className   = `scada-signal clear ${railClass}`;
    el.dataset.id  = trackId;
    el.style.left  = `${sx}px`;
    el.style.top   = `${sy}px`;
    // The ::after post is vertical, so rotate the whole signal head perpendicular to track
    el.innerHTML = `<div class="light r"></div><div class="light g"></div>`;
    mapContainer.appendChild(el);
    return el;
}

function makeCrossover(src, tgt) {
    const mx = (src.x + tgt.x) / 2;
    const my = (src.y + tgt.y) / 2;
    const el = document.createElement('div');
    el.className  = 'crossover';
    el.style.left = `${mx}px`;
    el.style.top  = `${my}px`;
    el.title = 'Crossover / Point Switch';
    mapContainer.appendChild(el);
}

// ═══════════════════════════════════════════════════════
//  buildMap — called when MAP_LAYOUT arrives from server
// ═══════════════════════════════════════════════════════
function buildMap(stations, tracks) {
    if (!mapContainer) return;
    document.querySelectorAll('.track-up, .track-dn, .station, .scada-signal, .crossover, .track-arrow, .yard-spur').forEach(el => el.remove());

    const GAP = 10; 
    const processedEdges = new Set(); // Prevents drawing 4 rails for a double track

    tracks.forEach(track => {
        // Group tracks regardless of direction
        const edgeKey = track.src < track.tgt ? `${track.src}|${track.tgt}` : `${track.tgt}|${track.src}`;
        if (processedEdges.has(edgeKey)) return; 
        processedEdges.add(edgeKey);

        const src = nodeCoords[track.src];
        const tgt = nodeCoords[track.tgt];
        if (!src || !tgt) return;

        // Check which directions ACTUALLY exist in the backend
        const hasUp = tracks.some(t => t.src === track.src && t.tgt === track.tgt);
        const hasDn = tracks.some(t => t.src === track.tgt && t.tgt === track.src);

        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const { px, py } = perpOffset(dx, dy, GAP);

        if (hasUp) {
            trackMeta[`${track.src}-${track.tgt}`] = { src: track.src, tgt: track.tgt };
            const upEl = makeRail('track-up', src, tgt, px, py, `${track.src}-${track.tgt}`, track.is_broken);
            makeArrow(src, tgt, px, py, true);
            const sigUp = makeSignal(src.x + px, src.y + py, tgt.x + px, tgt.y + py, `${track.src}-${track.tgt}`, 'sig-up');
            activeTracks[`${track.src}-${track.tgt}`] = { up: upEl };
            activeSignals[`${track.src}-${track.tgt}`] = { up: sigUp };
        }
        
        if (hasDn) {
            trackMeta[`${track.tgt}-${track.src}`] = { src: track.tgt, tgt: track.src };
            const dnEl = makeRail('track-dn', src, tgt, -px, -py, `${track.tgt}-${track.src}`, track.is_broken);
            makeArrow(src, tgt, -px, -py, false);
            const sigDn = makeSignal(tgt.x - px, tgt.y - py, src.x - px, src.y - py, `${track.tgt}-${track.src}`, 'sig-dn');
            activeTracks[`${track.tgt}-${track.src}`] = { dn: dnEl };
            activeSignals[`${track.tgt}-${track.src}`] = { dn: sigDn };
        }

        if (hasUp && hasDn && (CROSSOVER_TRACKS.has(edgeKey) || CROSSOVER_TRACKS.has(`${track.tgt}|${track.src}`))) {
            makeCrossover(src, tgt);
        }
    });

    // ── Stations ──
   // ── Stations & Yard Sidings ──
    stations.forEach(station => {
        if (!nodeCoords[station.id]) nodeCoords[station.id] = { x: 100, y: 100 };
        const coords = nodeCoords[station.id];

        // 1. Draw the Yard Spur (The tail with the diamond)
        const yardEl = document.createElement('div');
        yardEl.className = 'yard-spur';
        yardEl.style.left = `${coords.x - 1}px`; // Centered on X
        yardEl.style.top  = `${coords.y}px`;     // Starts at the exact center of the station
        yardEl.style.transform = `rotate(20deg)`; // Angles it downwards and slightly right!
        mapContainer.appendChild(yardEl);

        // 2. Draw the main Station Node (Draws OVER the start of the spur line)
        const el = document.createElement('div');
        el.className   = 'station';
        el.dataset.id  = station.id;
        el.style.left  = `${coords.x}px`;
        el.style.top   = `${coords.y}px`;
        el.innerHTML   = `<div class="station-label">${station.id}</div>`;
el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.shiftKey) {
                if (!selectedStationId) {
                    selectedStationId = station.id;
                    el.style.borderColor = '#00ff00';
                    el.style.boxShadow   = '0 0 12px #00ff00';
                } else {
                    if (selectedStationId !== station.id) {
                        // NEW: Open Track Modal instead of sending WS instantly
                        document.getElementById('trk-src').value = selectedStationId;
                        document.getElementById('trk-tgt').value = station.id;
                        
                        // Auto-calculate visual distance for the default length
                        const dx = nodeCoords[station.id].x - nodeCoords[selectedStationId].x;
                        const dy = nodeCoords[station.id].y - nodeCoords[selectedStationId].y;
                        document.getElementById('trk-len').value = Math.floor(Math.hypot(dx, dy) / 2);
                        
                        document.getElementById('track-modal').style.display = 'flex';
                    }
                    selectedStationId = null;
                    document.querySelectorAll('.station').forEach(s => { s.style.borderColor = ''; s.style.boxShadow = ''; });
                }
            } else {
                document.getElementById('disp-src').value = station.id;
                document.getElementById('dispatch-modal').style.display = 'flex';
                document.getElementById('disp-tgt').focus();
            }
        });

        mapContainer.appendChild(el);
    });
}

// ═══════════════════════════════════════════════════════
//  updateState — called every tick from STATE_UPDATE msg
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
//  updateState — Upgraded Visual Glide & Crash Protection
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
//  updateState — Trusting the C++ Mutex Locks
// ═══════════════════════════════════════════════════════
function updateState(data) {

    // 1. Clock & UI State
    if (data.sim_active !== undefined) {
        const clockEl   = document.getElementById('sim-clock');
        const totalMins = data.sim_time;
        const hr  = Math.floor(totalMins / 60) % 24;
        const mn  = totalMins % 60;
        const hrS = hr.toString().padStart(2, '0');
        const mnS = mn.toString().padStart(2, '0');
        const running = data.sim_active;

        const btnToggle = document.getElementById('btn-toggle');
        if (running) {
            btnToggle.innerText = '⏸ PAUSE SIMULATION';
            btnToggle.style.background = '#b45309'; 
            btnToggle.style.borderColor = '#f59e0b';
        } else {
            btnToggle.innerText = '▶ START SIMULATION';
            btnToggle.style.background = '#166534'; 
            btnToggle.style.borderColor = '#22c55e';
        }
        
        clockEl.innerText = `CLOCK: ${hrS}:${mnS} ${running ? '(RUNNING)' : '(PAUSED)'}`;
        clockEl.style.color = running ? 'var(--text-ok)' : 'var(--text-warn)';
        clockEl.style.borderColor = running ? 'var(--text-ok)' : 'var(--text-warn)';

        if (data.trains) {
            data.trains.forEach(t => {
                const schedItem = document.getElementById(`sched-${t.id}`);
                if (schedItem) schedItem.remove();
            });
        }
    }

    // 2. Track Coloring (BUG 1 FIX: Strictly read C++ Mutex Locks!)
    const lockedSet = new Set(data.locked_tracks || []);
    let lockedCount = 0;

    for (const trackId in activeTracks) {
        const pair = activeTracks[trackId];
        const sigPair = activeSignals[trackId];
        const isLocked = lockedSet.has(trackId); // Checks if THIS EXACT direction is locked

        if (isLocked) lockedCount++;

        if (pair.up) {
            if (isLocked) {
                if (!pair.up.classList.contains('locked')) {
                    pair.up.classList.add('locked');
                    if (sigPair && sigPair.up) sigPair.up.classList.replace('clear', 'danger');
                }
            } else {
                if (pair.up.classList.contains('locked')) {
                    pair.up.classList.remove('locked');
                    if (sigPair && sigPair.up) sigPair.up.classList.replace('danger', 'clear');
                }
            }
        }

        if (pair.dn) {
            if (isLocked) {
                if (!pair.dn.classList.contains('locked')) {
                    pair.dn.classList.add('locked');
                    if (sigPair && sigPair.dn) sigPair.dn.classList.replace('clear', 'danger');
                }
            } else {
                if (pair.dn.classList.contains('locked')) {
                    pair.dn.classList.remove('locked');
                    if (sigPair && sigPair.dn) sigPair.dn.classList.replace('danger', 'clear');
                }
            }
        }
    }

    // 3. Trains (BUG 2 FIX: Simplified Directional Math)
    const currentTrainIds = new Set();
    if (data.trains) {
        data.trains.forEach(t => {
            currentTrainIds.add(t.id);
            let targetX = 0, targetY = 0;
            
            // Match the UI glide speed to your C++ sleep physics
            let speed = (t.type === 'Express') ? 7 : (t.type === 'Freight') ? 18 : 12;

            if (nodeCoords[t.loc]) {
                targetX = nodeCoords[t.loc].x;
                targetY = nodeCoords[t.loc].y;
            } else if (t.loc && t.loc.includes('-')) {
                const [s, g] = t.loc.split('-');
                if (nodeCoords[s] && nodeCoords[g]) {
                    
                    // Always calculate relative to the current direction of travel
                    const dx = nodeCoords[g].x - nodeCoords[s].x;
                    const dy = nodeCoords[g].y - nodeCoords[s].y;
                    const { px, py } = perpOffset(dx, dy, 10); // Offset to the right-hand rail

                    // SET TARGET TO THE DESTINATION STATION + RAIL OFFSET
                    targetX = nodeCoords[g].x + px; 
                    targetY = nodeCoords[g].y + py;

                    // If the train just popped into existence, snap it to the STARTING station
                    if (!activeTrains[t.id]) {
                        const el = document.createElement('div');
                        el.className = 'train ' + t.type;
                        el.innerText = t.id;
                        mapContainer.appendChild(el);
                        activeTrains[t.id] = el;

                        let startX = nodeCoords[s].x + px;
                        let startY = nodeCoords[s].y + py;

                        el.style.transition = 'none'; // Snap instantly
                        el.style.left = `${startX}px`;
                        el.style.top = `${startY}px`;
                        el.getBoundingClientRect(); // Force browser reflow
                    }
                } else return;
            } else return;

            // Apply the smooth CSS glide to the destination
            if (activeTrains[t.id]) {
                activeTrains[t.id].style.transition = `left ${speed}s linear, top ${speed}s linear`;
                activeTrains[t.id].style.left = `${targetX}px`;
                activeTrains[t.id].style.top  = `${targetY}px`;
            }
        });
    }

    // Clean up arrived/deleted trains
    for (const id in activeTrains) {
        if (!currentTrainIds.has(id)) {
            activeTrains[id].remove();
            delete activeTrains[id];
        }
    }

    // Update Telemetry Panel
    const statTrains = document.getElementById('stat-trains');
    const statLocked = document.getElementById('stat-locked');
    if (statTrains) statTrains.innerText = currentTrainIds.size;
    if (statLocked) statLocked.innerText = lockedCount;
} */


let nodeCoords = {
    // Western Line Hubs
    "ANDHERI":      { x: 350, y: 500 },
    "CHURCHGATE":   { x: 650, y: 500 },

    // Central Line Hubs
    "KASARA":       { x: 50,  y: 300 },
    "KALYAN":       { x: 200, y: 320 }, // Junction
    "THANE":        { x: 300, y: 340 }, // Junction
    "DADAR":        { x: 500, y: 440 }, // Mega Junction (Central + Western)
    "CST":          { x: 650, y: 380 }, // Mega Terminal (Central + Harbour)

    // Harbour / Trans-Harbour Hubs
    "PANVEL":       { x: 300, y:  50 }, // Junction
    "VASHI":        { x: 400, y: 100 },
    "KURLA":        { x: 520, y: 200 }, // Junction
    "NERUL":        { x: 420, y: 150 },

    // Extended Mainline (Mumbai–Pune)
    "KARJAT":       { x: 800, y: 360 }, // Junction
    "KHOPOLI":      { x: 850, y: 450 }, // Branch end
    "LONAVALA":     { x: 900, y: 300 },
    "TALEGAON":     { x: 980, y: 260 },
    "SHIVAJINAGAR": { x:1060, y: 230 },
    "PUNE":         { x:1150, y: 200 }
};

// Tracks that should show a crossover diamond
const CROSSOVER_TRACKS = new Set([
    "KALYAN|THANE",
    "THANE|DADAR",
    "DADAR|CST",
    "KARJAT|LONAVALA",
    "LONAVALA|TALEGAON",
    "VASHI|KURLA",
    "ANDHERI|DADAR"
]);

const activeTrains   = {};
const activeTracks   = {};   // trackId → { up, dn } DOM elements
const activeSignals  = {};   // trackId → { up, dn } DOM elements
// trackMeta stores the canonical src/tgt so we can derive direction per-train
const trackMeta      = {};   // trackId → { src, tgt }
let selectedStationId = null;

const mapContainer = document.getElementById('map-container');
const eventLog     = document.getElementById('event-log');

// ── WebSocket ────────────────────────────────────────────
const ws = new WebSocket('ws://localhost:8080/ws');

function logEvent(msg, color = "#8aabcf") {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const div  = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `<span style="color:#3a5a80">[${time}]</span> <span style="color:${color}">${msg}</span>`;
    eventLog.prepend(div);
    // keep log trimmed
    while (eventLog.children.length > 80) eventLog.lastChild.remove();
}

ws.onopen  = () => {
    document.getElementById('status').innerText = 'SYS.ONLINE';
    document.getElementById('status').style.color = 'var(--text-ok)';
    logEvent('WebSocket connected.', 'var(--text-ok)');
};
ws.onclose = () => {
    document.getElementById('status').innerText = 'SYS.OFFLINE';
    document.getElementById('status').style.color = 'var(--text-danger)';
    logEvent('WebSocket closed.', 'var(--text-danger)');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if      (data.type === 'MAP_LAYOUT')   buildMap(data.stations, data.tracks);
    else if (data.type === 'STATE_UPDATE') updateState(data);
    else if (data.type === 'ESTOP_STATE')  handleEStop(data.state);
};

// ── Manual clock ──────────────────────────────────────────
function setManualTime() {
    const v = document.getElementById('manual-time').value;
    if (!v) return;
    const [h, m] = v.split(':').map(Number);
    ws.send(JSON.stringify({ action: 'SET_TIME', hour: h, minute: m }));
    logEvent(`Clock set → ${v}`, 'var(--text-warn)');
}

function toggleSimulation() {
    ws.send(JSON.stringify({ action: 'TOGGLE_SIMULATION' }));
}

function resetSimulation() {
    if(confirm("⚠ WARNING: This will wipe all trains and reset the clock. Proceed?")) {
        ws.send(JSON.stringify({ action: 'RESET_SIMULATION' }));
        document.getElementById('schedule-board').innerHTML = ''; // Clear the board visually
        logEvent("SYSTEM RESET EXECUTED.", "#ff4444");
    }
}

// ── Demo yard builder ─────────────────────────────────────
function loadDemoMap() {
    logEvent('INITIALIZING AUTOMATED YARD BUILD…', 'var(--text-warn)');
    Object.keys(nodeCoords).forEach(id =>
        ws.send(JSON.stringify({ action: 'ADD_STATION', id, name: id }))
    );

    setTimeout(() => {
        const tracks = [
            // Western Line
            ["ANDHERI", "DADAR"],
            ["DADAR",   "CHURCHGATE"],
            // Central Line
            ["KASARA",  "KALYAN"],
            ["KALYAN",  "THANE"],
            ["THANE",   "DADAR"],
            ["DADAR",   "CST"],
            // Harbour Line
            ["PANVEL",  "VASHI"],
            ["VASHI",   "KURLA"],
            ["KURLA",   "CST"],
            // Trans-Harbour
            ["THANE",   "NERUL"],
            ["NERUL",   "PANVEL"],
            // Karjat Branch & Mainline to Pune
            ["KALYAN",  "KARJAT"],
            ["KARJAT",  "KHOPOLI"],
            ["KARJAT",  "LONAVALA"],
            ["LONAVALA","TALEGAON"],
            ["TALEGAON","SHIVAJINAGAR"],
            ["SHIVAJINAGAR","PUNE"]
        ];
        
        tracks.forEach(t => {
            const dx  = nodeCoords[t[1]].x - nodeCoords[t[0]].x;
            const dy  = nodeCoords[t[1]].y - nodeCoords[t[0]].y;
            const len = Math.floor(Math.hypot(dx, dy) / 2);
            ws.send(JSON.stringify({ action: 'ADD_TRACK', src: t[0], tgt: t[1], length: len }));
        });
        logEvent('YARD BUILD COMPLETE.', 'var(--text-ok)');
    }, 500);
}

// ── Modals ────────────────────────────────────────────────
let tempX = 0, tempY = 0;

function closeModals() {
    document.getElementById('build-modal').style.display    = 'none';
    document.getElementById('dispatch-modal').style.display = 'none';
    document.getElementById('track-modal').style.display    = 'none'; 
    // NEW: Close animal modal
    document.getElementById('animal-modal').style.display   = 'none'; 
    document.getElementById('new-station-id').value = '';
}

mapContainer.addEventListener('click', (e) => {
    // NEW: Intercept clicks on tracks to trigger Wildlife Detection
    if (e.target.classList.contains('track-up') || e.target.classList.contains('track-dn')) {
        const trackId = e.target.dataset.id;
        document.getElementById('anim-track-id').value = trackId;
        document.getElementById('animal-modal').style.display = 'flex';
        return; 
    }

    if (e.target !== mapContainer) return;
    tempX = e.clientX;
    tempY = e.clientY - 52;   // subtract header height
    document.getElementById('build-modal').style.display = 'flex';
    document.getElementById('new-station-id').focus();
});

function submitStation() {
    const sid = document.getElementById('new-station-id').value.toUpperCase();
    if (!sid) return;
    nodeCoords[sid] = { x: tempX, y: tempY };
    ws.send(JSON.stringify({ action: 'ADD_STATION', id: sid, name: sid }));
    closeModals();
}

function submitDispatch() {
    const src  = document.getElementById('disp-src').value;
    const tgt  = document.getElementById('disp-tgt').value.toUpperCase();
    const name = document.getElementById('disp-name').value || 'TRN-' + Math.floor(Math.random() * 1000);
    const type = document.getElementById('disp-type').value;
    const tv   = document.getElementById('disp-time').value;
    if (!tv) return alert('Please set a scheduled time!');
    const [h, m] = tv.split(':').map(Number);

    ws.send(JSON.stringify({ action: 'SMART_DISPATCH', src, tgt, type, name, sched_hour: h, sched_min: m }));
    closeModals();

    const board = document.getElementById('schedule-board');
    const entry = document.createElement('div');
    entry.id = `sched-${name}`;
    entry.className = 'sched-entry';
    entry.innerHTML =
        `⏳ <b style="color:var(--text-warn)">${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}</b>`
        + ` &nbsp;${name} <span style="color:var(--text-dim)">(${type})</span><br>`
        + `&nbsp;&nbsp;↳ ${src} → ${tgt}`;
    board.appendChild(entry);

    logEvent(`[${name}] Queued @ ${tv}.`, 'var(--text-accent)');
}

function submitTrack() {
    const src = document.getElementById('trk-src').value;
    const tgt = document.getElementById('trk-tgt').value;
    const len = parseInt(document.getElementById('trk-len').value) || 50;
    const mode = document.getElementById('trk-mode').value;

    ws.send(JSON.stringify({ action: 'ADD_TRACK', src: src, tgt: tgt, length: len, mode: mode }));
    closeModals();
    logEvent(`Laying ${mode} track from ${src} to ${tgt}...`, "#38bdf8");
}

// NEW: Submit wildlife toggle
function submitAnimals() {
    const trackId = document.getElementById('anim-track-id').value;
    ws.send(JSON.stringify({ action: 'TOGGLE_ANIMALS', id: trackId }));
    closeModals();
    logEvent(`🐘 Wildlife Crossing Active on ${trackId}`, "#e879f9");
}

// ── E-Stop ────────────────────────────────────────────────
let isEStopActive = false;
function toggleEStop() {
    isEStopActive = !isEStopActive;
    ws.send(JSON.stringify({ action: 'E_STOP', state: isEStopActive }));
}
function handleEStop(state) {
    const overlay = document.getElementById('estop-overlay');
    const btn     = document.getElementById('estop-btn');
    if (state) {
        overlay.style.display = 'block';
        btn.className = 'ctrl-btn btn-estop-active';
        btn.innerText = '■ RELEASE E-STOP';
        logEvent('SYSTEM HALTED BY DISPATCHER', 'var(--text-danger)');
    } else {
        overlay.style.display = 'none';
        btn.className = 'ctrl-btn btn-estop';
        btn.innerText = '⚠ EMERGENCY STOP';
        logEvent('SYSTEM RESUMED', 'var(--text-ok)');
    }
}

// right-click: sabotage track or delete station
mapContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target.classList.contains('track-up') || e.target.classList.contains('track-dn')) {
        const id = e.target.dataset.id;
        // mark both rails broken
        const pair = activeTracks[id];
        if (pair) {
            pair.up && pair.up.classList.add('broken');
            pair.dn && pair.dn.classList.add('broken');
        }
        logEvent(`TRACK ${id} SABOTAGED.`, 'var(--text-warn)');
        ws.send(JSON.stringify({ action: 'SABOTAGE_TRACK', id }));
    } else if (e.target.classList.contains('station')) {
        ws.send(JSON.stringify({ action: 'DELETE_STATION', id: e.target.dataset.id }));
    }
});

// ═══════════════════════════════════════════════════════
//  CORE RENDERING HELPERS
// ═══════════════════════════════════════════════════════

function perpOffset(dx, dy, gap) {
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { px: (-dy / len) * gap, py: (dx / len) * gap };
}

function makeRail(cls, src, tgt, offsetX, offsetY, trackId, isBroken) {
    const sx = src.x + offsetX, sy = src.y + offsetY;
    const tx = tgt.x + offsetX, ty = tgt.y + offsetY;
    const dx = tx - sx, dy = ty - sy;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle  = Math.atan2(dy, dx) * 180 / Math.PI;

    const MARGIN = 13;   // clear the larger station dot 
    const drawLen = Math.max(0, length - MARGIN * 2);

    const el = document.createElement('div');
    el.className = cls + (isBroken ? ' broken' : '');
    el.dataset.id = trackId;
    el.style.width     = `${drawLen}px`;
    el.style.left      = `${sx + Math.cos(angle * Math.PI / 180) * MARGIN}px`;
    el.style.top       = `${sy + Math.sin(angle * Math.PI / 180) * MARGIN}px`;
    el.style.transform = `translate(0, -50%) rotate(${angle}deg)`;
    mapContainer.appendChild(el);
    return el;
}

function makeArrow(src, tgt, offsetX, offsetY, upDirection) {
    const MID = 0.5;
    const mx = (src.x + tgt.x) / 2 + offsetX;
    const my = (src.y + tgt.y) / 2 + offsetY;
    const dx = tgt.x - src.x, dy = tgt.y - src.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    const el = document.createElement('div');
    el.className  = 'track-arrow';
    el.style.left = `${mx}px`;
    el.style.top  = `${my}px`;
    el.style.transform = `translate(-50%, -50%) rotate(${upDirection ? angle : angle + 180}deg)`;
    // SVG triangle arrow
    el.innerHTML =
        `<svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">`
        + `<path d="M0 4L10 4M6 1L10 4L6 7" stroke="rgba(56,189,248,0.6)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`
        + `</svg>`;
    mapContainer.appendChild(el);
    return el;
}

function makeSignal(srcX, srcY, tgtX, tgtY, trackId, railClass) {
    const dx    = tgtX - srcX, dy = tgtY - srcY;
    const len   = Math.sqrt(dx * dx + dy * dy) || 1;
    const angle = Math.atan2(dy, dx);
    const POS   = 0.18;  // 18% along the track from src
    const sx    = srcX + Math.cos(angle) * len * POS;
    const sy    = srcY + Math.sin(angle) * len * POS;

    const el = document.createElement('div');
    el.className   = `scada-signal clear ${railClass}`;
    el.dataset.id  = trackId;
    el.style.left  = `${sx}px`;
    el.style.top   = `${sy}px`;
    el.innerHTML = `<div class="light r"></div><div class="light g"></div>`;
    mapContainer.appendChild(el);
    return el;
}

function makeCrossover(src, tgt) {
    const mx = (src.x + tgt.x) / 2;
    const my = (src.y + tgt.y) / 2;
    const el = document.createElement('div');
    el.className  = 'crossover';
    el.style.left = `${mx}px`;
    el.style.top  = `${my}px`;
    el.title = 'Crossover / Point Switch';
    mapContainer.appendChild(el);
}

// ═══════════════════════════════════════════════════════
//  buildMap — called when MAP_LAYOUT arrives from server
// ═══════════════════════════════════════════════════════
function buildMap(stations, tracks) {
    if (!mapContainer) return;
    document.querySelectorAll('.track-up, .track-dn, .station, .scada-signal, .crossover, .track-arrow, .yard-spur').forEach(el => el.remove());

    const GAP = 10; 
    const processedEdges = new Set(); // Prevents drawing 4 rails for a double track

    tracks.forEach(track => {
        // Group tracks regardless of direction
        const edgeKey = track.src < track.tgt ? `${track.src}|${track.tgt}` : `${track.tgt}|${track.src}`;
        if (processedEdges.has(edgeKey)) return; 
        processedEdges.add(edgeKey);

        const src = nodeCoords[track.src];
        const tgt = nodeCoords[track.tgt];
        if (!src || !tgt) return;

        // Check which directions ACTUALLY exist in the backend
        const hasUp = tracks.some(t => t.src === track.src && t.tgt === track.tgt);
        const hasDn = tracks.some(t => t.src === track.tgt && t.tgt === track.src);

        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const { px, py } = perpOffset(dx, dy, GAP);

        if (hasUp) {
            trackMeta[`${track.src}-${track.tgt}`] = { src: track.src, tgt: track.tgt };
            const upEl = makeRail('track-up', src, tgt, px, py, `${track.src}-${track.tgt}`, track.is_broken);
            makeArrow(src, tgt, px, py, true);
            const sigUp = makeSignal(src.x + px, src.y + py, tgt.x + px, tgt.y + py, `${track.src}-${track.tgt}`, 'sig-up');
            activeTracks[`${track.src}-${track.tgt}`] = { up: upEl };
            activeSignals[`${track.src}-${track.tgt}`] = { up: sigUp };
        }
        
        if (hasDn) {
            trackMeta[`${track.tgt}-${track.src}`] = { src: track.tgt, tgt: track.src };
            const dnEl = makeRail('track-dn', src, tgt, -px, -py, `${track.tgt}-${track.src}`, track.is_broken);
            makeArrow(src, tgt, -px, -py, false);
            const sigDn = makeSignal(tgt.x - px, tgt.y - py, src.x - px, src.y - py, `${track.tgt}-${track.src}`, 'sig-dn');
            activeTracks[`${track.tgt}-${track.src}`] = { dn: dnEl };
            activeSignals[`${track.tgt}-${track.src}`] = { dn: sigDn };
        }

        if (hasUp && hasDn && (CROSSOVER_TRACKS.has(edgeKey) || CROSSOVER_TRACKS.has(`${track.tgt}|${track.src}`))) {
            makeCrossover(src, tgt);
        }
    });

    // ── Stations & Yard Sidings ──
    stations.forEach(station => {
        if (!nodeCoords[station.id]) nodeCoords[station.id] = { x: 100, y: 100 };
        const coords = nodeCoords[station.id];

        // 1. Draw the Yard Spur
        const yardEl = document.createElement('div');
        yardEl.className = 'yard-spur';
        yardEl.style.left = `${coords.x - 1}px`; 
        yardEl.style.top  = `${coords.y}px`;     
        yardEl.style.transform = `rotate(20deg)`; 
        mapContainer.appendChild(yardEl);

        // 2. Draw the main Station Node
        const el = document.createElement('div');
        el.className   = 'station';
        el.dataset.id  = station.id;
        el.style.left  = `${coords.x}px`;
        el.style.top   = `${coords.y}px`;
        el.innerHTML   = `<div class="station-label">${station.id}</div>`;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.shiftKey) {
                if (!selectedStationId) {
                    selectedStationId = station.id;
                    el.style.borderColor = '#00ff00';
                    el.style.boxShadow   = '0 0 12px #00ff00';
                } else {
                    if (selectedStationId !== station.id) {
                        document.getElementById('trk-src').value = selectedStationId;
                        document.getElementById('trk-tgt').value = station.id;
                        
                        const dx = nodeCoords[station.id].x - nodeCoords[selectedStationId].x;
                        const dy = nodeCoords[station.id].y - nodeCoords[selectedStationId].y;
                        document.getElementById('trk-len').value = Math.floor(Math.hypot(dx, dy) / 2);
                        
                        document.getElementById('track-modal').style.display = 'flex';
                    }
                    selectedStationId = null;
                    document.querySelectorAll('.station').forEach(s => { s.style.borderColor = ''; s.style.boxShadow = ''; });
                }
            } else {
                document.getElementById('disp-src').value = station.id;
                document.getElementById('dispatch-modal').style.display = 'flex';
                document.getElementById('disp-tgt').focus();
            }
        });

        mapContainer.appendChild(el);
    });
}

// ═══════════════════════════════════════════════════════
//  updateState — Trusting the C++ Mutex Locks & Physics
// ═══════════════════════════════════════════════════════
function updateState(data) {

    // 1. Clock & UI State
    if (data.sim_active !== undefined) {
        const clockEl   = document.getElementById('sim-clock');
        const totalMins = data.sim_time;
        const hr  = Math.floor(totalMins / 60) % 24;
        const mn  = totalMins % 60;
        const hrS = hr.toString().padStart(2, '0');
        const mnS = mn.toString().padStart(2, '0');
        const running = data.sim_active;

        const btnToggle = document.getElementById('btn-toggle');
        if (running) {
            btnToggle.innerText = '⏸ PAUSE SIMULATION';
            btnToggle.style.background = '#b45309'; 
            btnToggle.style.borderColor = '#f59e0b';
        } else {
            btnToggle.innerText = '▶ START SIMULATION';
            btnToggle.style.background = '#166534'; 
            btnToggle.style.borderColor = '#22c55e';
        }
        
        clockEl.innerText = `CLOCK: ${hrS}:${mnS} ${running ? '(RUNNING)' : '(PAUSED)'}`;
        clockEl.style.color = running ? 'var(--text-ok)' : 'var(--text-warn)';
        clockEl.style.borderColor = running ? 'var(--text-ok)' : 'var(--text-warn)';

        if (data.trains) {
            data.trains.forEach(t => {
                const schedItem = document.getElementById(`sched-${t.id}`);
                if (schedItem) schedItem.remove();
            });
        }
    }

    // 2. Track Coloring & Wildlife Rendering
    // 2. Track Coloring & Wildlife Rendering
    const lockedSet = new Set(data.locked_tracks || []);
    const animalSet = new Set(data.animal_tracks || []); 
    let lockedCount = 0;

    for (const trackId in activeTracks) {
        const pair = activeTracks[trackId];
        const sigPair = activeSignals[trackId];
        const isLocked = lockedSet.has(trackId); 
        const hasAnimals = animalSet.has(trackId);

        // --- THE FIX: UN-HIDEABLE INLINE ELEPHANT ---
        let markerId = `elephant-${trackId}`;
        let marker = document.getElementById(markerId);
        
        if (hasAnimals && !marker) {
            marker = document.createElement('div');
            marker.id = markerId;
            marker.innerText = '🐘';
            
            // Pure inline styles: Impossible to be overwritten by rogue CSS
            marker.style.position = 'absolute';
            marker.style.zIndex = '9999'; 
            marker.style.fontSize = '28px';
            marker.style.pointerEvents = 'none';
            marker.style.transform = 'translate(-50%, -50%)';
            marker.style.textShadow = '0 0 15px #f0abfc, 0 0 30px #d946ef'; // Glowing pink
            
            const [s, g] = trackId.split('-');
            if (nodeCoords[s] && nodeCoords[g]) {
                marker.style.left = `${(nodeCoords[s].x + nodeCoords[g].x)/2}px`;
                marker.style.top  = `${(nodeCoords[s].y + nodeCoords[g].y)/2}px`;
            }
            mapContainer.appendChild(marker);

            // Manual JS Animation so it pulses no matter what
            marker.blinkInterval = setInterval(() => {
                marker.style.opacity = marker.style.opacity === '0.5' ? '1' : '0.5';
                marker.style.transform = marker.style.opacity === '1' ? 'translate(-50%, -50%) scale(1.3)' : 'translate(-50%, -50%) scale(0.9)';
                marker.style.transition = 'all 0.5s ease-in-out';
            }, 600);

        } else if (!hasAnimals && marker) {
            clearInterval(marker.blinkInterval); // Stop animation
            marker.remove(); // Safely clear it
        }

        // Standard Lock Checking
        if (isLocked) lockedCount++;

        // --- THE MISSING LOGIC: Color the tracks RED/GREEN! ---
        if (pair.up) {
            if (isLocked) {
                if (!pair.up.classList.contains('locked')) {
                    pair.up.classList.add('locked');
                    if (sigPair && sigPair.up) sigPair.up.classList.replace('clear', 'danger');
                }
            } else {
                if (pair.up.classList.contains('locked')) {
                    pair.up.classList.remove('locked');
                    if (sigPair && sigPair.up) sigPair.up.classList.replace('danger', 'clear');
                }
            }
        }

        if (pair.dn) {
            if (isLocked) {
                if (!pair.dn.classList.contains('locked')) {
                    pair.dn.classList.add('locked');
                    if (sigPair && sigPair.dn) sigPair.dn.classList.replace('clear', 'danger');
                }
            } else {
                if (pair.dn.classList.contains('locked')) {
                    pair.dn.classList.remove('locked');
                    if (sigPair && sigPair.dn) sigPair.dn.classList.replace('danger', 'clear');
                }
            }
        }
    } // <--- THIS IS THE BRACE THAT WAS MISSING!

    // 3. Trains (With Dynamic Speed Matching)
    const currentTrainIds = new Set();
    if (data.trains) {
        data.trains.forEach(t => {
            currentTrainIds.add(t.id);
            let targetX = 0, targetY = 0;
            
            // Match the UI glide speed to your dynamic C++ physics
            let speed = t.speed || ((t.type === 'Express') ? 7 : (t.type === 'Freight') ? 18 : 12);

            if (nodeCoords[t.loc]) {
                targetX = nodeCoords[t.loc].x;
                targetY = nodeCoords[t.loc].y;
            } else if (t.loc && t.loc.includes('-')) {
                const [s, g] = t.loc.split('-');
                if (nodeCoords[s] && nodeCoords[g]) {
                    
                    const dx = nodeCoords[g].x - nodeCoords[s].x;
                    const dy = nodeCoords[g].y - nodeCoords[s].y;
                    const { px, py } = perpOffset(dx, dy, 10); 

                    targetX = nodeCoords[g].x + px; 
                    targetY = nodeCoords[g].y + py;

                    if (!activeTrains[t.id]) {
                        const el = document.createElement('div');
                        el.className = 'train ' + t.type;
                        el.innerText = t.id;
                        mapContainer.appendChild(el);
                        activeTrains[t.id] = el;

                        let startX = nodeCoords[s].x + px;
                        let startY = nodeCoords[s].y + py;

                        el.style.transition = 'none'; 
                        el.style.left = `${startX}px`;
                        el.style.top = `${startY}px`;
                        el.getBoundingClientRect(); 
                    }
                } else return;
            } else return;

            // Apply the smooth CSS glide (Slows down automatically if passing an animal!)
            if (activeTrains[t.id]) {
                activeTrains[t.id].style.transition = `left ${speed}s linear, top ${speed}s linear`;
                activeTrains[t.id].style.left = `${targetX}px`;
                activeTrains[t.id].style.top  = `${targetY}px`;
            }
        });
    }

    for (const id in activeTrains) {
        if (!currentTrainIds.has(id)) {
            activeTrains[id].remove();
            delete activeTrains[id];
        }
    }

    const statTrains = document.getElementById('stat-trains');
    const statLocked = document.getElementById('stat-locked');
    if (statTrains) statTrains.innerText = currentTrainIds.size;
    if (statLocked) statLocked.innerText = lockedCount;
}