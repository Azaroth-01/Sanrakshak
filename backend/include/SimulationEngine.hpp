#pragma once
#include "models.hpp"
#include <unordered_map>
#include <memory>
#include <string>
#include <atomic>
#include <vector>
#include <thread>

namespace SimulationEngine {
    // --- Data Storage ---
    extern std::unordered_map<std::string, std::shared_ptr<Train>> active_trains;
    
    // --- State Control Flags ---
    extern std::atomic<bool> is_paused;          // Toggles movement/clock
    extern std::atomic<bool> global_estop;      // Emergency Stop (all red)
    extern std::atomic<int> sim_time_mins;      // Master Master Clock (0-1439)
    extern std::atomic<bool> master_clock_running; // Internal check for the clock thread

    // --- Core Lifecycle Functions ---
    
    /** * Toggles the simulation between RUNNING and PAUSED. 
     * Starts the master clock thread on the first call.
     */
    void toggleSimulation();

    /** * Signals all train threads to abort, clears the active_trains map, 
     * and resets the master clock to 00:00.
     */
    void resetSimulation();

    /** * Creates a new train thread. 
     * The train will wait until sim_time_mins >= sched_time_mins to depart.
     */
    void spawnTrain(std::string id, std::string type, int priority, std::vector<std::string> route, int sched_time_mins);
}