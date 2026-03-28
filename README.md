# 🚆 Sanrakshan | Real-Time Railway Interlocking & CTC

**Sanrakshan** *(Sanskrit for “Protection”)* is a high-concurrency, distributed simulation of a **Centralized Traffic Control (CTC)** system. It demonstrates the integration of low-level **C++ system programming** with real-time web visualization to solve complex challenges in **railway safety** and **autonomous collision avoidance**.

---

## 🏗️ System Architecture

The project follows a **decoupled Producer–Consumer architecture**:

### 🔹 Backend (C++17)
- Multi-threaded simulation engine  
- Each train runs as an independent `std::thread`  
- Handles physics, routing, and concurrency  

### 🔹 Interlocking Layer
- Mutex-based resource management  
- Enforces **mutual exclusion** on track segments  
- Prevents collisions and unsafe state transitions  

### 🔹 Communication
- High-speed **WebSocket pipeline**  
- Broadcasts full system state (**JSON**) at **5–10 Hz**  

### 🔹 Frontend (JS/CSS3)
- Custom **SCADA-style dashboard**  
- Uses geometric pixel-snatching for precise sync  
- Keeps browser animations aligned with backend state  

---

## 🛡️ Key Features

### 1. 🚦 Kavach (Autonomous Collision Avoidance)
- Implements a **TCAS (Train Collision Avoidance System)**  
- Uses **non-blocking `try_lock()`** instead of traditional locks  

**Behavior:**
- If track is occupied → triggers `TCAS_ACTIVE`  
- UI shows high-intensity **red strobe alert**  
- Thread yields execution instead of blocking  
- Prevents **circular wait** → avoids deadlocks  

---

### 2. 🐘 Temporary Speed Restrictions (TSR) & Wildlife Safety
- Real-time hazard detection (e.g., **elephant crossings**)  

**Synchronization Strategy:**
- **Backend:** Thread pauses instantly  
- **Frontend:** Uses `getBoundingClientRect()`  
- Ensures animation state is preserved (no teleportation glitches)  

---

### 3. 📡 Live SCADA Telemetry
Interactive **HUD (Heads-Up Display)** enables:

- 📍 Live GPS-style coordinates  
- ⚡ Actual vs target speed  
- 🚨 Safety status:
  - In Transit  
  - Wildlife Halt  
  - TCAS Active  

---

## 🛠️ Tech Stack

| Layer        | Technologies |
|-------------|-------------|
| **Backend** | C++17, POSIX Threads, Mutex Concurrency, Atomic Operations |
| **Frontend** | Vanilla JavaScript (ES6+), CSS3 Grid/Flexbox, HTML5 Canvas |
| **Networking** | WebSockets (Full-duplex), JSON |
| **Algorithms** | Dijkstra’s Shortest Path, Deadlock Avoidance (Coffman Conditions) |

---

## 🚀 Quick Start

### 📦 Prerequisites
- `g++` (C++17 support required)  
- `make` build tool  

---

### ⚙️ Compilation

```bash
# Clean and build the server
make clean
make

# Run the simulation
./sanrakshan_server
