#pragma once

#include "models.hpp"
#include <thread>
#include <vector>
#include <atomic>
#include <memory>
#include <unordered_map>

namespace SimulationEngine {
    // Global flag to pause threads when adding new tracks from the UI
    extern std::atomic<bool> is_simulation_running;
    extern std::atomic<bool> global_estop;

    // Keep track of active trains
    extern std::unordered_map<std::string, std::shared_ptr<Train>> active_trains;

    // Core loops
    void startEngine();
    void trainThreadFunction(std::shared_ptr<Train> train);
    void runDeadlockDetector();

    // Spawner
    void spawnTrain(const std::string& id, const std::string& type, int priority, const std::vector<std::string>& route);
}