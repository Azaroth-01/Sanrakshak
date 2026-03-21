#include "SimulationEngine.hpp"
#include "NetworkGraph.hpp"
#include <iostream>
#include <chrono>
#include <thread>

namespace SimulationEngine {
    std::atomic<bool> is_simulation_running(true);
    std::unordered_map<std::string, std::shared_ptr<Train>> active_trains;
    std::vector<std::thread> train_threads;
    std::atomic<bool> global_estop(false);

    std::atomic<bool> simulation_started(false);
    std::atomic<int> sim_time_mins(0);

    void startSimulation() {
        if (simulation_started) return; 
        simulation_started = true;
        std::thread([]() {
            while (simulation_started) {
                while (global_estop) { std::this_thread::sleep_for(std::chrono::milliseconds(200)); } 
                
                // ACCELERATED CLOCK: 1 Real Second = 1 Sim Minute
                std::this_thread::sleep_for(std::chrono::seconds(1)); 
                sim_time_mins++; 
                if (sim_time_mins >= 1440) sim_time_mins = 0; // Wrap around at Midnight!
            }
        }).detach();
    }

    void trainThreadFunction(std::shared_ptr<Train> train) {
        std::cout << "[ENGINE] Train " << train->id << " STANDBY for Min: " << train->scheduled_time_mins << std::endl;

        while (!simulation_started || sim_time_mins < train->scheduled_time_mins) {
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }
        
        train->has_departed = true; 
        std::cout << "[ENGINE] Train " << train->id << " DEPARTED at Min: " << sim_time_mins << std::endl;

        for (size_t i = 1; i < train->route.size(); ++i) {
            while (global_estop) { std::this_thread::sleep_for(std::chrono::milliseconds(200)); }

            std::string next_station = train->route[i];
            std::string t_id1 = train->current_location + "-" + next_station;
            std::string t_id2 = next_station + "-" + train->current_location;
            bool track_broken = false;
            {
                std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
                if (NetworkGraph::tracks.count(t_id1) && NetworkGraph::tracks[t_id1]->is_broken) track_broken = true;
                if (NetworkGraph::tracks.count(t_id2) && NetworkGraph::tracks[t_id2]->is_broken) track_broken = true;
            }

            if (track_broken) {
                std::cout << "[ALARM] Train " << train->id << " detected broken track! Detouring...\n";
                std::vector<std::string> new_route = NetworkGraph::calculateShortestPath(train->current_location, train->route.back());
                if (new_route.size() < 2) {
                    std::cout << "[ALARM] Train " << train->id << " is STRANDED.\n";
                    break; 
                }
                train->route = new_route;
                i = 0; 
                continue; 
            }

            std::shared_ptr<TrackSegment> target_track = nullptr;
            {
                std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
                if (NetworkGraph::tracks.count(t_id1)) target_track = NetworkGraph::tracks[t_id1];
                else if (NetworkGraph::tracks.count(t_id2)) target_track = NetworkGraph::tracks[t_id2];
            }

            if (target_track) {
                std::lock_guard<std::mutex> track_lock(target_track->segment_lock);
                train->current_location = target_track->id;
                
                int speed_ms = 400; 
                if (train->type == "Express") speed_ms = 150; 
                else if (train->type == "Freight") speed_ms = 800; 

                std::this_thread::sleep_for(std::chrono::milliseconds(speed_ms));
            }
            train->current_location = next_station;
        }

        std::cout << "[ENGINE] Train " << train->id << " reached final destination." << std::endl;
        std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
        active_trains.erase(train->id);
    }

    void spawnTrain(std::string id, std::string type, int priority, std::vector<std::string> route, int sched_time_mins) {
        auto train = std::make_shared<Train>(id, type, priority, route, sched_time_mins);
        active_trains[id] = train;
        train_threads.emplace_back(std::thread(trainThreadFunction, train));
    }
}