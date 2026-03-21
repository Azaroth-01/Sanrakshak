#include "SimulationEngine.hpp"
#include "NetworkGraph.hpp"
#include <iostream>
#include <chrono>

namespace SimulationEngine {
    std::atomic<bool> is_simulation_running(true);
    std::unordered_map<std::string, std::shared_ptr<Train>> active_trains;
    std::vector<std::thread> train_threads;
    std::atomic<bool> global_estop(false);

    // This is the lifecycle of a single Train
void trainThreadFunction(std::shared_ptr<Train> train) {
        std::cout << "[ENGINE] Train " << train->id << " (" << train->type << ") departing " << train->route[0] << std::endl;

        for (size_t i = 1; i < train->route.size(); ++i) {
            while (global_estop) { std::this_thread::sleep_for(std::chrono::milliseconds(200)); }

            std::string next_station = train->route[i];

            // 1. DYNAMIC FAULT CHECK: Is the track ahead sabotaged?
            std::string t_id1 = train->current_location + "-" + next_station;
            std::string t_id2 = next_station + "-" + train->current_location;
            bool track_broken = false;
            {
                std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
                if (NetworkGraph::tracks.count(t_id1) && NetworkGraph::tracks[t_id1]->is_broken) track_broken = true;
                if (NetworkGraph::tracks.count(t_id2) && NetworkGraph::tracks[t_id2]->is_broken) track_broken = true;
            }

            if (track_broken) {
                std::cout << "[SYSTEM ALARM] Train " << train->id << " detected broken track ahead! Recalculating detour...\n";
                std::vector<std::string> new_route = NetworkGraph::calculateShortestPath(train->current_location, train->route.back());
                
                if (new_route.size() < 2) {
                    std::cout << "[SYSTEM ALARM] Train " << train->id << " is STRANDED. No alternate route exists.\n";
                    break; // Terminate train thread
                }
                train->route = new_route;
                i = 0; // Reset index to follow new route
                continue; 
            }

            // 2. Lock the track and move
            std::shared_ptr<TrackSegment> target_track = nullptr;
            {
                std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
                if (NetworkGraph::tracks.count(t_id1)) target_track = NetworkGraph::tracks[t_id1];
                else if (NetworkGraph::tracks.count(t_id2)) target_track = NetworkGraph::tracks[t_id2];
            }

            if (target_track) {
                std::lock_guard<std::mutex> track_lock(target_track->segment_lock);
                train->current_location = target_track->id;
                
                // 3. APPLY TRAIN PHYSICS (Speeds)
                int speed_ms = 400; // Local Default
                if (train->type == "Express") speed_ms = 150; // Fastest
                else if (train->type == "Freight") speed_ms = 800; // Slow, causes bottlenecks

                std::this_thread::sleep_for(std::chrono::milliseconds(speed_ms));
            }
            train->current_location = next_station;
        }

        std::cout << "[ENGINE] Train " << train->id << " reached final destination." << std::endl;
        std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
        active_trains.erase(train->id);
    }

    // Helper to create a train and start its thread
    void spawnTrain(const std::string& id, const std::string& type, int priority, const std::vector<std::string>& route) {
        auto train = std::make_shared<Train>(id, type, priority, route);
        active_trains[id] = train;
        train_threads.emplace_back(std::thread(trainThreadFunction, train));
    }

    // Starts the whole simulation
    void startEngine() {
        std::cout << "\n[ENGINE] Starting Simulation Threads...\n";
        
        // Define the route from Mumbai down to Pune
        std::vector<std::string> route_down = {"CSMT", "DR", "TNA", "KYN", "KJT", "LNL", "PUNE"};

        // Spawn two trains to test the track locks!
        spawnTrain("EXP-101", "Express", 1, route_down);
        
        // Wait half a second, then send a slower Freight train behind it
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        spawnTrain("FRT-999", "Freight", 3, route_down);
        
        // Detach threads so they run independently in the background
        for(auto& t : train_threads) {
            if(t.joinable()) t.detach(); 
        }
    }
}