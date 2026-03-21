/* let nodeCoords = {
    // Western Line
    "W_ANDHERI":     { x: 350, y: 540 },
    "W_DADAR":       { x: 500, y: 520 },
    "W_CHURCHGATE":  { x: 650, y: 500 },

    // Central Line
    "C_KASARA":      { x: 50,  y: 300 },
    "C_KALYAN":      { x: 200, y: 320 },
    "C_THANE":       { x: 300, y: 340 },
    "C_DADAR":       { x: 500, y: 360 },
    "C_CST":         { x: 650, y: 380 },

    // Harbour Line
    "H_PANVEL":      { x: 300, y: 50 },
    "H_VASHI":       { x: 400, y: 100 },
    "H_KURLA":       { x: 520, y: 200 },
    "H_CST":         { x: 650, y: 380 },

    // Trans-Harbour
    "T_THANE":       { x: 300, y: 340 },
    "T_NERUL":       { x: 420, y: 180 },
    "T_PANVEL":      { x: 300, y: 50 },

    // Karjat / Khopoli Branch
    "B_KARJAT":      { x: 150, y: 200 },
    "B_KHOPOLI":     { x: 220, y: 120 },

    // --- FIXED: EXTENDED MAINLINE (RIGHT SIDE) ---
    "M_KARJAT":      { x: 800, y: 360 },
    "M_LONAVALA":    { x: 900, y: 300 },
    "M_TALEGAON":    { x: 980, y: 260 },
    "M_SHIVAJINAGAR":{ x: 1060,y: 230 },
    "M_PUNE":        { x: 1150,y: 200 },

    // Junctions
    "J_KALYAN":      { x: 200, y: 320 },
    "J_THANE":       { x: 300, y: 340 },
    "J_KURLA":       { x: 520, y: 200 },
    "J_DADAR":       { x: 500, y: 360 }
}; 
const activeTrains = {}; 
const activeTracks = {}; 
const activeSignals = {}; 
let selectedStationId = null;

const mapContainer = document.getElementById('map-container');
const eventLog = document.getElementById('event-log');
const ws = new WebSocket('ws://localhost:8080/ws');

function logEvent(msg, color="#ccc") {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const div = document.createElement('div');
    div.innerHTML = `<span style="color:#555">[${time}]</span> <span style="color:${color}">${msg}</span>`;
    eventLog.prepend(div); 
}

ws.onopen = () => { document.getElementById('status').innerText = "SYS.ONLINE"; document.getElementById('status').style.color = "#0f0"; };
ws.onclose = () => { document.getElementById('status').innerText = "SYS.OFFLINE"; document.getElementById('status').style.color = "#f00"; };

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "MAP_LAYOUT") {
        buildMap(data.stations, data.tracks);
    } else if (data.type === "STATE_UPDATE") {
        updateState(data);
    } else if (data.type === "ESTOP_STATE") {
        handleEStop(data.state);
    }
};

// --- MANUAL CLOCK CONTROLS ---
function setManualTime() {
    const timeVal = document.getElementById('manual-time').value;
    if(!timeVal) return;
    const [h, m] = timeVal.split(':').map(Number);
    ws.send(JSON.stringify({ action: "SET_TIME", hour: h, minute: m }));
    logEvent(`Clock manually calibrated to ${timeVal}`, "#facc15");
}

function startSimulation() {
    ws.send(JSON.stringify({ action: "START_SIMULATION" }));
    logEvent("MASTER CLOCK ACTIVATED (1 SEC = 1 MIN)", "#22c55e");
}

// --- AUTOMATED DEMO BUILDER ---
function loadDemoMap() {
    logEvent("INITIALIZING AUTOMATED YARD BUILD...", "#facc15");
    Object.keys(nodeCoords).forEach(id => {
        ws.send(JSON.stringify({ action: "ADD_STATION", id: id, name: id }));
    });
    
    setTimeout(() => {
          const tracks = [
    // --- Western Line (trimmed) ---
    ["W_ANDHERI", "W_DADAR"],
    ["W_DADAR", "W_CHURCHGATE"],

    // --- Central Line ---
    ["C_KASARA", "C_KALYAN"],
    ["C_KALYAN", "C_THANE"],
    ["C_THANE", "C_DADAR"],
    ["C_DADAR", "C_CST"],

    // --- Harbour Line ---
    ["H_PANVEL", "H_VASHI"],
    ["H_VASHI", "H_KURLA"],
    ["H_KURLA", "H_CST"],

    // --- Trans-Harbour ---
    ["T_THANE", "T_NERUL"],
    ["T_NERUL", "T_PANVEL"],

    // --- Karjat / Khopoli Branch ---
    ["C_KALYAN", "B_KARJAT"],
    ["B_KARJAT", "B_KHOPOLI"],

    // --- Mumbai → Pune ---
    ["C_KALYAN", "M_KARJAT"],
    ["M_KARJAT", "M_LONAVALA"],
    ["M_LONAVALA", "M_TALEGAON"],
    ["M_TALEGAON", "M_SHIVAJINAGAR"],
    ["M_SHIVAJINAGAR", "M_PUNE"],

    // --- Interconnections ---
    ["C_THANE", "T_THANE"],
    ["H_KURLA", "J_KURLA"],
    ["J_KURLA", "C_DADAR"],
    ["W_DADAR", "J_DADAR"],
    ["J_DADAR", "C_DADAR"],
    ["H_CST", "C_CST"]
];
        tracks.forEach(t => {
            const dx = nodeCoords[t[1]].x - nodeCoords[t[0]].x;
            const dy = nodeCoords[t[1]].y - nodeCoords[t[0]].y;
            const len = Math.floor(Math.hypot(dx, dy) / 2); 
            ws.send(JSON.stringify({ action: "ADD_TRACK", src: t[0], tgt: t[1], length: len }));
        });
        logEvent("YARD BUILD COMPLETE.", "#22c55e");
    }, 500);
}

// --- MODAL & CLICK LOGIC ---
let tempX = 0, tempY = 0;

function closeModals() {
    document.getElementById('build-modal').style.display = 'none';
    document.getElementById('dispatch-modal').style.display = 'none';
    document.getElementById('new-station-id').value = '';
}

mapContainer.addEventListener('click', (e) => {
    if (e.target !== mapContainer) return; 
    tempX = e.clientX; tempY = e.clientY - 50;
    document.getElementById('build-modal').style.display = 'flex';
    document.getElementById('new-station-id').focus();
});

function submitStation() {
    const sid = document.getElementById('new-station-id').value.toUpperCase();
    if (!sid) return;
    nodeCoords[sid] = { x: tempX, y: tempY }; 
    ws.send(JSON.stringify({ action: "ADD_STATION", id: sid, name: sid }));
    closeModals();
}

function submitDispatch() {
    const src = document.getElementById('disp-src').value;
    const tgt = document.getElementById('disp-tgt').value.toUpperCase();
    const name = document.getElementById('disp-name').value || "TRN-" + Math.floor(Math.random()*1000);
    const type = document.getElementById('disp-type').value;
    
    // Parse the 24-hour time picker
    const timeVal = document.getElementById('disp-time').value;
    if(!timeVal) return alert("Please set a scheduled time!");
    const [h, m] = timeVal.split(':').map(Number);

    ws.send(JSON.stringify({ action: "SMART_DISPATCH", src: src, tgt: tgt, type: type, name: name, sched_hour: h, sched_min: m }));
    closeModals();
    
    // Write to Schedule Board in HH:MM format
    const board = document.getElementById('schedule-board');
    if (board) {
        const entry = document.createElement('div');
        entry.id = `sched-${name}`; 
        entry.innerHTML = `⏳ <b>${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}</b> | ${name} (${type}) <br>&nbsp;&nbsp;&nbsp;↳ ${src} &rarr; ${tgt}`;
        board.appendChild(entry);
    }
    
    logEvent(`[${name}] Queued for Departure at ${timeVal}.`, "#38bdf8");
}

// --- E-STOP AND SABOTAGE ---
let isEStopActive = false;
function toggleEStop() {
    isEStopActive = !isEStopActive;
    ws.send(JSON.stringify({ action: "E_STOP", state: isEStopActive }));
}

function handleEStop(state) {
    const overlay = document.getElementById('estop-overlay');
    const btn = document.getElementById('estop-btn');
    if (state) {
        overlay.style.display = 'block';
        btn.style.background = '#facc15'; btn.style.color = '#000'; btn.innerText = 'RELEASE E-STOP';
        logEvent("SYSTEM HALTED BY DISPATCHER", "#ef4444");
    } else {
        overlay.style.display = 'none';
        btn.style.background = '#991b1b'; btn.style.color = 'white'; btn.innerText = 'EMERGENCY STOP';
        logEvent("SYSTEM RESUMED", "#22c55e");
    }
}

mapContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target.classList.contains('track')) {
        const id = e.target.dataset.id;
        e.target.classList.add('broken'); 
        logEvent(`TRACK ${id} SABOTAGED.`, "#fbbf24");
        ws.send(JSON.stringify({ action: "SABOTAGE_TRACK", id: id }));
    } else if (e.target.classList.contains('station')) {
        ws.send(JSON.stringify({ action: "DELETE_STATION", id: e.target.dataset.id }));
    }
});

// --- CORE RENDERING ---
function buildMap(stations, tracks) {
    if (!mapContainer) return;
    document.querySelectorAll('.track, .station, .scada-signal').forEach(el => el.remove());
    
    tracks.forEach(track => {
        const src = nodeCoords[track.src];
        const tgt = nodeCoords[track.tgt];
        if (!src || !tgt) return; 

        const dx = tgt.x - src.x; const dy = tgt.y - src.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        const line = document.createElement('div');
        line.className = 'track' + (track.is_broken ? ' broken' : ''); 
        line.dataset.id = track.id;
        line.style.width = `${length - 16}px`; 
        line.style.left = `${src.x + Math.cos(angle * Math.PI/180) * 8}px`; 
        line.style.top = `${src.y + Math.sin(angle * Math.PI/180) * 8}px`;
        line.style.transform = `translate(0, -50%) rotate(${angle}deg)`;
        mapContainer.appendChild(line);
        activeTracks[track.id] = line;

        const sigEl = document.createElement('div');
        sigEl.className = 'scada-signal clear';
        sigEl.innerHTML = `<div class="light r"></div><div class="light y"></div><div class="light g"></div>`;
        sigEl.style.left = `${src.x + (Math.cos(angle * Math.PI/180) * 20)}px`;
        sigEl.style.top = `${src.y + (Math.sin(angle * Math.PI/180) * 20)}px`;
        mapContainer.appendChild(sigEl);
        activeSignals[track.id] = sigEl;
    });

    stations.forEach(station => {
        if (!nodeCoords[station.id]) nodeCoords[station.id] = { x: 100, y: 100 }; 
        const coords = nodeCoords[station.id];

        const statEl = document.createElement('div');
        statEl.className = 'station';
        statEl.dataset.id = station.id;
        statEl.style.left = `${coords.x}px`;
        statEl.style.top = `${coords.y}px`;
        statEl.innerHTML = `<div class="station-label">${station.id}</div>`;

        statEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.shiftKey) { 
                if (!selectedStationId) {
                    selectedStationId = station.id;
                    statEl.style.border = "3px solid #0f0"; 
                } else {
                    if (selectedStationId !== station.id) {
                        ws.send(JSON.stringify({ action: "ADD_TRACK", src: selectedStationId, tgt: station.id, length: 10 }));
                    }
                    selectedStationId = null;
                    document.querySelectorAll('.station').forEach(s => s.style.border = "2px solid #333");
                }
            } else { 
                document.getElementById('disp-src').value = station.id;
                document.getElementById('dispatch-modal').style.display = 'flex';
                document.getElementById('disp-tgt').focus();
            }
        });

        mapContainer.appendChild(statEl);
    });
}

function updateState(data) {
    // 1. UPDATE THE CLOCK (Even if paused!)
    if (data.sim_active !== undefined) {
        const clockEl = document.getElementById('sim-clock');
        
        let totalMins = data.sim_time;
        let hr = Math.floor(totalMins / 60) % 24; // Forces 24-Hour limit
        let mn = totalMins % 60;
        
        let hrStr = hr.toString().padStart(2, '0');
        let mnStr = mn.toString().padStart(2, '0');
        
        clockEl.innerText = `CLOCK: ${hrStr}:${mnStr} ${data.sim_active ? "(RUNNING)" : "(PAUSED)"}`;
        clockEl.style.color = data.sim_active ? "#22c55e" : "#facc15";
        clockEl.style.borderColor = data.sim_active ? "#22c55e" : "#facc15";
        
        // Remove dispatched trains from the board
        if (data.trains) {
            data.trains.forEach(t => {
                const schedItem = document.getElementById(`sched-${t.id}`);
                if (schedItem) schedItem.remove(); 
            });
        }
    }

    // 2. UPDATE TRACK LOCKS & SIGNALS
    const lockedSet = new Set(data.locked_tracks || []);
    for (const trackId in activeTracks) {
        if (lockedSet.has(trackId)) {
            if (!activeTracks[trackId].classList.contains('locked')) {
                activeTracks[trackId].classList.add('locked');
                if (activeSignals[trackId]) { activeSignals[trackId].classList.remove('clear'); activeSignals[trackId].classList.add('danger'); }
                logEvent(`TC_${trackId} OCCUPIED.`, "#ff0000");
            }
        } else {
            if (activeTracks[trackId].classList.contains('locked')) {
                activeTracks[trackId].classList.remove('locked');
                if (activeSignals[trackId]) { activeSignals[trackId].classList.remove('danger'); activeSignals[trackId].classList.add('clear'); }
                logEvent(`TC_${trackId} CLEAR.`, "#00ff00");
            }
        }
    }

    // 3. RENDER VISIBLE TRAINS
    const currentTrainIds = new Set();
    if (data.trains) {
        data.trains.forEach(t => {
            currentTrainIds.add(t.id);
            let targetX = 0, targetY = 0;

            if (nodeCoords[t.loc]) {
                targetX = nodeCoords[t.loc].x; targetY = nodeCoords[t.loc].y;
            } else if (t.loc.includes("-")) {
                const [src, tgt] = t.loc.split("-");
                if (nodeCoords[src] && nodeCoords[tgt]) {
                    targetX = (nodeCoords[src].x + nodeCoords[tgt].x) / 2;
                    targetY = (nodeCoords[src].y + nodeCoords[tgt].y) / 2;
                } else return;
            } else return;

            if (!activeTrains[t.id]) {
                const trainEl = document.createElement('div');
                trainEl.className = 'train ' + t.type; 
                trainEl.innerText = t.id; 
                mapContainer.appendChild(trainEl);
                activeTrains[t.id] = trainEl;
            } 
            activeTrains[t.id].style.left = `${targetX}px`; activeTrains[t.id].style.top = `${targetY}px`;
        });
    }

    for (const id in activeTrains) {
        if (!currentTrainIds.has(id)) {
            activeTrains[id].remove(); delete activeTrains[id];
        }
    }
} */



    // ═══════════════════════════════════════════════════════
//  SANRAKSHAN CTC — app.js
//  Parallel-track SCADA renderer with crossovers & signals
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  SANRAKSHAN CTC — app.js
//  Parallel-track SCADA renderer with crossovers & signals
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
//  SANRAKSHAN CTC — app.js
//  Parallel-track SCADA renderer with crossovers & signals
// ═══════════════════════════════════════════════════════

let nodeCoords = {
    // Western Line
    "W_ANDHERI":      { x: 350, y: 540 },
    "W_DADAR":        { x: 500, y: 520 },
    "W_CHURCHGATE":   { x: 650, y: 500 },

    // Central Line
    "C_KASARA":       { x: 50,  y: 300 },
    "C_KALYAN":       { x: 200, y: 320 },
    "C_THANE":        { x: 300, y: 340 },
    "C_DADAR":        { x: 500, y: 360 },
    "C_CST":          { x: 650, y: 380 },

    // Harbour Line
    "H_PANVEL":       { x: 300, y:  50 },
    "H_VASHI":        { x: 400, y: 100 },
    "H_KURLA":        { x: 520, y: 200 },
    "H_CST":          { x: 650, y: 380 },

    // Trans-Harbour
    "T_THANE":        { x: 300, y: 340 },
    "T_NERUL":        { x: 420, y: 180 },
    "T_PANVEL":       { x: 300, y:  50 },

    // Karjat / Khopoli Branch
    "B_KARJAT":       { x: 150, y: 200 },
    "B_KHOPOLI":      { x: 220, y: 120 },

    // Extended Mainline (Mumbai–Pune)
    "M_KARJAT":       { x: 800, y: 360 },
    "M_LONAVALA":     { x: 900, y: 300 },
    "M_TALEGAON":     { x: 980, y: 260 },
    "M_SHIVAJINAGAR": { x:1060, y: 230 },
    "M_PUNE":         { x:1150, y: 200 },

    // Junctions (shared with Central/Trans/Harbour)
    "J_KALYAN":       { x: 200, y: 320 },
    "J_THANE":        { x: 300, y: 340 },
    "J_KURLA":        { x: 520, y: 200 },
    "J_DADAR":        { x: 500, y: 360 }
};

// Tracks that should show a crossover diamond (track-changing point)
// Specify the mid-point fraction (0–1) along the track where the crossover sits
const CROSSOVER_TRACKS = new Set([
    "C_KALYAN|C_THANE",
    "C_THANE|C_DADAR",
    "C_DADAR|C_CST",
    "M_KARJAT|M_LONAVALA",
    "M_LONAVALA|M_TALEGAON",
    "H_VASHI|H_KURLA",
    "W_DADAR|W_CHURCHGATE"
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

function startSimulation() {
    ws.send(JSON.stringify({ action: 'START_SIMULATION' }));
    logEvent('MASTER CLOCK ACTIVATED (1 SEC = 1 MIN)', 'var(--text-ok)');
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
            ["W_ANDHERI", "W_DADAR"],
            ["W_DADAR",   "W_CHURCHGATE"],
            // Central Line
            ["C_KASARA",  "C_KALYAN"],
            ["C_KALYAN",  "C_THANE"],
            ["C_THANE",   "C_DADAR"],
            ["C_DADAR",   "C_CST"],
            // Harbour Line
            ["H_PANVEL",  "H_VASHI"],
            ["H_VASHI",   "H_KURLA"],
            ["H_KURLA",   "H_CST"],
            // Trans-Harbour
            ["T_THANE",   "T_NERUL"],
            ["T_NERUL",   "T_PANVEL"],
            // Karjat / Khopoli Branch
            ["C_KALYAN",  "B_KARJAT"],
            ["B_KARJAT",  "B_KHOPOLI"],
            // Mumbai → Pune
            ["C_KALYAN",  "M_KARJAT"],
            ["M_KARJAT",  "M_LONAVALA"],
            ["M_LONAVALA","M_TALEGAON"],
            ["M_TALEGAON","M_SHIVAJINAGAR"],
            ["M_SHIVAJINAGAR","M_PUNE"],
            // Interconnections
            ["C_THANE",   "T_THANE"],
            ["H_KURLA",   "J_KURLA"],
            ["J_KURLA",   "C_DADAR"],
            ["W_DADAR",   "J_DADAR"],
            ["J_DADAR",   "C_DADAR"],
            ["H_CST",     "C_CST"]
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

/**
 * Returns the perpendicular offset vector (unit * gap).
 * The "up" track is offset +perp, "dn" track is offset -perp.
 */
function perpOffset(dx, dy, gap) {
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { px: (-dy / len) * gap, py: (dx / len) * gap };
}

/**
 * Create one track rail element (up or dn).
 */
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

/**
 * Create a tiny direction arrow on a rail.
 */
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

/**
 * Create a 3-light SCADA signal head for one rail.
 */
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

/**
 * Place a crossover diamond at the midpoint of a track.
 */
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
    // clear old elements
    document.querySelectorAll(
        '.track-up, .track-dn, .station, .scada-signal, .crossover, .track-arrow'
    ).forEach(el => el.remove());

    const GAP = 10;   // pixels between up and dn rails — enough to be clearly separate

    tracks.forEach(track => {
        const src = nodeCoords[track.src];
        const tgt = nodeCoords[track.tgt];
        if (!src || !tgt) return;

        // remember canonical direction for per-rail locking
        trackMeta[track.id] = { src: track.src, tgt: track.tgt };

        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const { px, py } = perpOffset(dx, dy, GAP);

        // ── UP rail (offset +perp) ──
        const upEl = makeRail('track-up', src, tgt,  px,  py, track.id, track.is_broken);
        // ── DN rail (offset -perp) ──
        const dnEl = makeRail('track-dn', src, tgt, -px, -py, track.id, track.is_broken);

        activeTracks[track.id] = { up: upEl, dn: dnEl };

        // ── Direction arrows ──
        makeArrow(src, tgt,  px,  py, true);    // up rail → toward tgt
        makeArrow(src, tgt, -px, -py, false);   // dn rail → toward src

        // ── Signals: one per rail, near the source end ──
        const sigUp = makeSignal(src.x + px, src.y + py, tgt.x + px, tgt.y + py, track.id, 'sig-up');
        const sigDn = makeSignal(tgt.x - px, tgt.y - py, src.x - px, src.y - py, track.id, 'sig-dn');
        activeSignals[track.id] = { up: sigUp, dn: sigDn };

        // ── Crossover diamond ──
        const key1 = `${track.src}|${track.tgt}`;
        const key2 = `${track.tgt}|${track.src}`;
        if (CROSSOVER_TRACKS.has(key1) || CROSSOVER_TRACKS.has(key2)) {
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
                        ws.send(JSON.stringify({ action: 'ADD_TRACK', src: selectedStationId, tgt: station.id, length: 10 }));
                    }
                    selectedStationId = null;
                    document.querySelectorAll('.station').forEach(s => {
                        s.style.borderColor = '';
                        s.style.boxShadow   = '';
                    });
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
function updateState(data) {

    // 1. Clock
    if (data.sim_active !== undefined) {
        const clockEl   = document.getElementById('sim-clock');
        const totalMins = data.sim_time;
        const hr  = Math.floor(totalMins / 60) % 24;
        const mn  = totalMins % 60;
        const hrS = hr.toString().padStart(2, '0');
        const mnS = mn.toString().padStart(2, '0');
        const running = data.sim_active;
        clockEl.innerText       = `CLOCK: ${hrS}:${mnS} ${running ? '(RUNNING)' : '(PAUSED)'}`;
        clockEl.style.color      = running ? 'var(--text-ok)'   : 'var(--text-warn)';
        clockEl.style.borderColor= running ? 'var(--text-ok)'   : 'var(--text-warn)';

        // Remove dispatched trains from schedule board
        if (data.trains) {
            data.trains.forEach(t => {
                const schedItem = document.getElementById(`sched-${t.id}`);
                if (schedItem) schedItem.remove();
            });
        }
    }

    // 2. Derive per-rail occupancy from live train positions
    //    The server gives us locked_tracks (segment IDs occupied by any train)
    //    AND trains[].loc which encodes the segment being traversed as "SRC-TGT".
    //    UP rail = train travelling src→tgt (canonical direction)
    //    DN rail = train travelling tgt→src (reverse)
    const upLockedSet = new Set();   // trackIds where UP rail is occupied
    const dnLockedSet = new Set();   // trackIds where DN rail is occupied

    if (data.trains) {
        data.trains.forEach(t => {
            if (t.loc && t.loc.includes('-')) {
                const [from, to] = t.loc.split('-');
                // Find which track this segment belongs to
                for (const [tid, meta] of Object.entries(trackMeta)) {
                    if (meta.src === from && meta.tgt === to) {
                        upLockedSet.add(tid);  // travelling in canonical direction → UP rail
                    } else if (meta.src === to && meta.tgt === from) {
                        dnLockedSet.add(tid);  // travelling in reverse → DN rail
                    }
                }
            }
        });
    }

    let lockedCount = 0;
    for (const trackId in activeTracks) {
        const pair    = activeTracks[trackId];
        const sigPair = activeSignals[trackId];
        const upLocked = upLockedSet.has(trackId);
        const dnLocked = dnLockedSet.has(trackId);

        // ── UP rail ──
        if (upLocked) {
            lockedCount++;
            if (!pair.up.classList.contains('locked')) {
                pair.up.classList.add('locked');
                if (sigPair) sigPair.up.classList.replace('clear', 'danger');
                logEvent(`TC_${trackId} UP OCCUPIED.`, 'var(--text-danger)');
            }
        } else {
            if (pair.up.classList.contains('locked')) {
                pair.up.classList.remove('locked');
                if (sigPair) sigPair.up.classList.replace('danger', 'clear');
                logEvent(`TC_${trackId} UP CLEAR.`, 'var(--text-ok)');
            }
        }

        // ── DN rail ──
        if (dnLocked) {
            lockedCount++;
            if (!pair.dn.classList.contains('locked')) {
                pair.dn.classList.add('locked');
                if (sigPair) sigPair.dn.classList.replace('clear', 'danger');
                logEvent(`TC_${trackId} DN OCCUPIED.`, 'var(--text-danger)');
            }
        } else {
            if (pair.dn.classList.contains('locked')) {
                pair.dn.classList.remove('locked');
                if (sigPair) sigPair.dn.classList.replace('danger', 'clear');
                logEvent(`TC_${trackId} DN CLEAR.`, 'var(--text-ok)');
            }
        }
    }

    // 3. Trains
    const currentTrainIds = new Set();
    if (data.trains) {
        data.trains.forEach(t => {
            currentTrainIds.add(t.id);
            let targetX = 0, targetY = 0;

            if (nodeCoords[t.loc]) {
                targetX = nodeCoords[t.loc].x;
                targetY = nodeCoords[t.loc].y;
            } else if (t.loc && t.loc.includes('-')) {
                const [s, g] = t.loc.split('-');
                if (nodeCoords[s] && nodeCoords[g]) {
                    targetX = (nodeCoords[s].x + nodeCoords[g].x) / 2;
                    targetY = (nodeCoords[s].y + nodeCoords[g].y) / 2;
                } else return;
            } else return;

            if (!activeTrains[t.id]) {
                const el = document.createElement('div');
                el.className = 'train ' + t.type;
                el.innerText = t.id;
                mapContainer.appendChild(el);
                activeTrains[t.id] = el;
            }
            activeTrains[t.id].style.left = `${targetX}px`;
            activeTrains[t.id].style.top  = `${targetY}px`;
        });
    }

    // remove departed trains
    for (const id in activeTrains) {
        if (!currentTrainIds.has(id)) {
            activeTrains[id].remove();
            delete activeTrains[id];
        }
    }

    // 4. Update mini stats
    const statTrains = document.getElementById('stat-trains');
    const statLocked = document.getElementById('stat-locked');
    if (statTrains) statTrains.innerText = currentTrainIds.size;
    if (statLocked) statLocked.innerText = lockedCount;
}