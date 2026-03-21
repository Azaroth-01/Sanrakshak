#pragma once
#include "models.hpp"
#include <unordered_map>
#include <memory>
#include <string>
#include <atomic>
#include <vector>
#include <thread>

namespace SimulationEngine {
    extern std::unordered_map<std::string, std::shared_ptr<Train>> active_trains;
    extern std::atomic<bool> is_simulation_running;
    extern std::atomic<bool> global_estop;
    
    extern std::atomic<bool> simulation_started;
    extern std::atomic<int> sim_time_mins; 

    void startSimulation();
    void spawnTrain(std::string id, std::string type, int priority, std::vector<std::string> route, int sched_time_mins);
}