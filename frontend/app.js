let nodeCoords = {};
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

// --- AUTOMATED DEMO BUILDER ---
function loadDemoMap() {
    logEvent("INITIALIZING AUTOMATED YARD BUILD...", "#facc15");
    nodeCoords = {
        "W_YARD": { x: 100, y: 300 }, "W_APP":  { x: 300, y: 300 },
        "JCT_W":  { x: 500, y: 300 }, "P1_A":   { x: 700, y: 200 },
        "P2_A":   { x: 700, y: 400 }, "JCT_E":  { x: 900, y: 300 },
        "E_APP":  { x: 1100, y: 300 }, "E_YARD": { x: 1300, y: 300 }
    };
    Object.keys(nodeCoords).forEach(id => {
        ws.send(JSON.stringify({ action: "ADD_STATION", id: id, name: id }));
    });
    setTimeout(() => {
        const tracks = [
            ["W_YARD", "W_APP"], ["W_APP", "JCT_W"], ["JCT_W", "P1_A"], ["P1_A", "JCT_E"], 
            ["JCT_W", "P2_A"], ["P2_A", "JCT_E"], ["JCT_E", "E_APP"], ["E_APP", "E_YARD"]
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

    ws.send(JSON.stringify({ action: "SMART_DISPATCH", src: src, tgt: tgt, type: type, name: name }));
    closeModals();
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
        // FIXED: Changed from source_id back to src!
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

        // SCADA SIGNALS
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

    const currentTrainIds = new Set();
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
            // This line ensures Express/Freight styling applies!
            trainEl.className = 'train ' + t.type; 
            trainEl.innerText = t.id; 
            mapContainer.appendChild(trainEl);
            activeTrains[t.id] = trainEl;
        } 
        activeTrains[t.id].style.left = `${targetX}px`; activeTrains[t.id].style.top = `${targetY}px`;
    });

    for (const id in activeTrains) {
        if (!currentTrainIds.has(id)) {
            activeTrains[id].remove(); delete activeTrains[id];
        }
    }
}