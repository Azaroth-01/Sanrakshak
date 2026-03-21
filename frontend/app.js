const nodeCoords = {
    "CSMT": { x: 100, y: 100 }, "DR":   { x: 250, y: 150 },
    "TNA":  { x: 400, y: 200 }, "KYN":  { x: 550, y: 250 },
    "KJT":  { x: 700, y: 400 }, "LNL":  { x: 850, y: 450 },
    "PUNE": { x: 1050, y: 500 }
};

const mapContainer = document.getElementById('map-container');
const statusText = document.getElementById('status');
const activeTrains = {}; 
let selectedStationId = null; // For linking tracks

const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = () => { statusText.innerText = "LINK ESTABLISHED - LIVE"; statusText.style.color = "#22c55e"; };
ws.onclose = () => { statusText.innerText = "CONNECTION LOST"; statusText.style.color = "#ef4444"; };

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "MAP_LAYOUT") buildMap(data.stations, data.tracks);
    else if (data.type === "STATE_UPDATE") updateTrains(data.trains);
};

// --- INTERACTIVE MAP BUILDER ---

// 1. Click empty space to add Station
mapContainer.addEventListener('click', (e) => {
    if (e.target !== mapContainer) return; 
    
    const id = prompt("Enter new Station ID (e.g., SUR):");
    if (!id) return;
    
    const sid = id.toUpperCase();
    nodeCoords[sid] = { x: e.clientX, y: e.clientY - 80 }; // Offset for header

    ws.send(JSON.stringify({ action: "ADD_STATION", id: sid, name: sid + " Station" }));
    selectedStationId = null; // Reset linking
});

// 2. Right-Click to Delete (Prevents default context menu)
mapContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target.classList.contains('station')) {
        const id = e.target.dataset.id;
        if(confirm(`Delete Station ${id}?`)) {
            ws.send(JSON.stringify({ action: "DELETE_STATION", id: id }));
        }
    } else if (e.target.classList.contains('track')) {
        const id = e.target.dataset.id;
        if(confirm(`Delete Track ${id}?`)) {
            ws.send(JSON.stringify({ action: "DELETE_TRACK", id: id }));
        }
    }
});

function buildMap(stations, tracks) {
    document.querySelectorAll('.track, .station').forEach(el => el.remove());

    tracks.forEach(track => {
        const src = nodeCoords[track.src];
        const tgt = nodeCoords[track.tgt];
        if (!src || !tgt) return;

        const length = Math.hypot(tgt.x - src.x, tgt.y - src.y);
        const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x) * (180 / Math.PI);

        const trackEl = document.createElement('div');
        trackEl.className = 'track';
        trackEl.dataset.id = track.id; // Store ID for deletion
        trackEl.style.width = `${length}px`;
        trackEl.style.left = `${src.x}px`;
        trackEl.style.top = `${src.y}px`;
        trackEl.style.transform = `translate(0, -50%) rotate(${angle}deg)`;
        mapContainer.appendChild(trackEl);
    });

    stations.forEach(station => {
        const coords = nodeCoords[station.id];
        if (!coords) return;

        const statEl = document.createElement('div');
        statEl.className = `station ${selectedStationId === station.id ? 'selected' : ''}`;
        statEl.dataset.id = station.id;
        statEl.style.left = `${coords.x}px`;
        statEl.style.top = `${coords.y}px`;

        // Click to Link Tracks
        statEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!selectedStationId) {
                selectedStationId = station.id;
                buildMap(stations, tracks); // Re-render to show green selection glow
            } else {
                if (selectedStationId !== station.id) {
                    // Auto-calculate track length based on pixels
                    const srcCoord = nodeCoords[selectedStationId];
                    const len = Math.floor(Math.hypot(coords.x - srcCoord.x, coords.y - srcCoord.y) / 5);
                    ws.send(JSON.stringify({ action: "ADD_TRACK", src: selectedStationId, tgt: station.id, length: len }));
                }
                selectedStationId = null;
            }
        });

        // Generate Fake GPS Data based on screen position
        const lat = (18.9 - (coords.y * 0.001)).toFixed(4);
        const lon = (72.8 + (coords.x * 0.001)).toFixed(4);
        const elev = Math.floor(coords.y > 300 ? 600 + (coords.y/2) : 10 + (coords.y/5)); // Elevates over Ghats

        statEl.innerHTML = `
            <div class="station-label">${station.id}</div>
            <div class="station-geo">${lat}°N, ${lon}°E | ${elev}m MSL</div>
        `;
        mapContainer.appendChild(statEl);
    });
}

function updateTrains(trains) {
    const currentTrainIds = new Set();
    trains.forEach(t => {
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
            trainEl.className = 'train';
            trainEl.innerHTML = `<div class="train-label">${t.id}</div>`;
            trainEl.style.left = `${targetX}px`; trainEl.style.top = `${targetY}px`;
            mapContainer.appendChild(trainEl);
            activeTrains[t.id] = trainEl;
        } else {
            activeTrains[t.id].style.left = `${targetX}px`;
            activeTrains[t.id].style.top = `${targetY}px`;
        }
    });

    for (const id in activeTrains) {
        if (!currentTrainIds.has(id)) {
            activeTrains[id].remove(); delete activeTrains[id];
        }
    }
}