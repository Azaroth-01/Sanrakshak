/* #include "SimulationEngine.hpp"
#include "NetworkGraph.hpp"
#include <iostream>
#include <chrono>
#include <thread>

namespace SimulationEngine {
    std::unordered_map<std::string, std::shared_ptr<Train>> active_trains;
    std::vector<std::thread> train_threads;
    
    std::atomic<bool> global_estop(false);
    std::atomic<bool> is_paused(true); 
    std::atomic<bool> master_clock_running(false);
    std::atomic<int> sim_time_mins(0);

    void toggleSimulation() {
        is_paused = !is_paused;
        if (!master_clock_running) {
            master_clock_running = true;
            std::thread([]() {
                while (true) {
                    if (!is_paused && !global_estop) {
                        std::this_thread::sleep_for(std::chrono::seconds(1));
                        if (!is_paused) sim_time_mins++; 
                        if (sim_time_mins >= 1440) sim_time_mins = 0; // Midnight loop
                    } else {
                        std::this_thread::sleep_for(std::chrono::milliseconds(200));
                    }
                }
            }).detach();
        }
    }

    void resetSimulation() {
        is_paused = true;
        // 1. Tell all trains to abort their missions
        for (auto& pair : active_trains) { pair.second->is_aborted = true; }
        
        // 2. Wait exactly 300ms for threads to see the abort signal and drop their mutex locks!
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
        
        // 3. Safely wipe the board
        std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
        active_trains.clear();
        sim_time_mins = 0;
        global_estop = false;
        std::cout << "\n[SYSTEM] === NUCLEAR RESET COMPLETE ===\n";
    }

    void trainThreadFunction(std::shared_ptr<Train> train) {
        // Wait for scheduled time
        while (is_paused || sim_time_mins < train->scheduled_time_mins) {
            if (train->is_aborted) return; // Self-Destruct
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }
        
        if (train->is_aborted) return;
        std::cout << "\n[ENGINE] CLOCK HIT! Train " << train->id << " is now DEPARTING at Min " << sim_time_mins << "!\n";
        train->has_departed = true;

        for (size_t i = 1; i < train->route.size(); ++i) {
            while (is_paused || global_estop) { 
                if (train->is_aborted) return;
                std::this_thread::sleep_for(std::chrono::milliseconds(200)); 
            }
            if (train->is_aborted) return;

           std::string next_station = train->route[i];
            
            // STRICT DIRECTIONAL TRACKING
            std::string track_id = train->current_location + "-" + next_station;
            
            bool track_broken = false;
            {
                std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
                if (NetworkGraph::tracks.count(track_id) && NetworkGraph::tracks[track_id]->is_broken) track_broken = true;
            }

            if (track_broken) {
                std::vector<std::string> new_route = NetworkGraph::calculateShortestPath(train->current_location, train->route.back());
                if (new_route.size() < 2) break; 
                train->route = new_route;
                i = 0; 
                continue; 
            }

            std::shared_ptr<TrackSegment> target_track = nullptr;
            {
                std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
                if (NetworkGraph::tracks.count(track_id)) target_track = NetworkGraph::tracks[track_id];
            }

            if (target_track) {
                // LOCK THE SPECIFIC DIRECTIONAL TRACK
                std::lock_guard<std::mutex> track_lock(target_track->segment_lock);
                train->current_location = target_track->id;
                
                // --- NEW: ULTRA-SLOW DEMO SPEEDS ---
                // Express = 7s, Local = 12s, Freight = 18s
                int speed_ms = 12000; // Default to Local
                if (train->type == "Express") speed_ms = 7000; 
                else if (train->type == "Freight") speed_ms = 18000; 

                // Micro-sleep loop so trains can be aborted mid-movement
                int elapsed = 0;
                while (elapsed < speed_ms) {
                    if (train->is_aborted) return; // Drops the lock automatically!
                    while (is_paused || global_estop) {
                        if (train->is_aborted) return;
                        std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    }
                    std::this_thread::sleep_for(std::chrono::milliseconds(50));
                    elapsed += 50;
                }
            }
            train->current_location = next_station;
        }

        if (!train->is_aborted) {
            std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
            active_trains.erase(train->id);
        }
    }

    void spawnTrain(std::string id, std::string type, int priority, std::vector<std::string> route, int sched_time_mins) {
        auto train = std::make_shared<Train>(id, type, priority, route, sched_time_mins);
        active_trains[id] = train;
        train_threads.emplace_back(std::thread(trainThreadFunction, train));
    }
} */

#include "SimulationEngine.hpp"
#include "NetworkGraph.hpp"
#include <iostream>
#include <chrono>
#include <thread>

namespace SimulationEngine {
    std::unordered_map<std::string, std::shared_ptr<Train>> active_trains;
    std::vector<std::thread> train_threads;
    
    std::atomic<bool> global_estop(false);
    std::atomic<bool> is_paused(true); 
    std::atomic<bool> master_clock_running(false);
    std::atomic<int> sim_time_mins(0);

    void toggleSimulation() {
        is_paused = !is_paused;
        if (!master_clock_running) {
            master_clock_running = true;
            std::thread([]() {
                while (true) {
                    if (!is_paused && !global_estop) {
                        std::this_thread::sleep_for(std::chrono::seconds(1));
                        if (!is_paused) sim_time_mins++; 
                        if (sim_time_mins >= 1440) sim_time_mins = 0; // Midnight loop
                    } else {
                        std::this_thread::sleep_for(std::chrono::milliseconds(200));
                    }
                }
            }).detach();
        }
    }

    void resetSimulation() {
        is_paused = true;
        // 1. Tell all trains to abort their missions
        for (auto& pair : active_trains) { pair.second->is_aborted = true; }
        
        // 2. Wait exactly 300ms for threads to see the abort signal and drop their mutex locks!
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
        
        // 3. Safely wipe the board
        std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
        active_trains.clear();
        sim_time_mins = 0;
        global_estop = false;
        std::cout << "\n[SYSTEM] === NUCLEAR RESET COMPLETE ===\n";
    }

    void trainThreadFunction(std::shared_ptr<Train> train) {
        // Wait for scheduled time
        while (is_paused || sim_time_mins < train->scheduled_time_mins) {
            if (train->is_aborted) return; // Self-Destruct
            std::this_thread::sleep_for(std::chrono::milliseconds(200));
        }
        
        if (train->is_aborted) return;
        std::cout << "\n[ENGINE] CLOCK HIT! Train " << train->id << " is now DEPARTING at Min " << sim_time_mins << "!\n";
        train->has_departed = true;

        for (size_t i = 1; i < train->route.size(); ++i) {
            while (is_paused || global_estop) { 
                if (train->is_aborted) return;
                std::this_thread::sleep_for(std::chrono::milliseconds(200)); 
            }
            if (train->is_aborted) return;

            std::string next_station = train->route[i];
            std::string track_id = train->current_location + "-" + next_station;
            
            // --- THE FIX: STATION HALT LOOP ---
            while (true) {
                if (train->is_aborted) return;
                while (is_paused || global_estop) std::this_thread::sleep_for(std::chrono::milliseconds(100));

                bool track_broken = false;
                bool track_has_animals = false;
                {
                    std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
                    if (NetworkGraph::tracks.count(track_id)) {
                        if (NetworkGraph::tracks[track_id]->is_broken) track_broken = true;
                        if (NetworkGraph::tracks[track_id]->has_animals) track_has_animals = true;
                    }
                }

                // If animals are ahead, SLEEP AT THE STATION and check again!
                if (track_has_animals) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(500));
                    continue; // Loops back to the top of the while(true)
                }

                // If track is broken, recalculate route
                if (track_broken) {
                    std::vector<std::string> new_route = NetworkGraph::calculateShortestPath(train->current_location, train->route.back());
                    if (new_route.size() < 2) break; 
                    train->route = new_route;
                    i = 0; // Restart routing
                    break; // Escapes the halt loop to restart outer loop
                }

                break; // Track is perfectly clear, escape loop and proceed!
            }
            if (i == 0) continue; // Route was recalculated

            std::shared_ptr<TrackSegment> target_track = nullptr;
            {
                std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
                if (NetworkGraph::tracks.count(track_id)) target_track = NetworkGraph::tracks[track_id];
            }

            if (target_track) {
                // LOCK THE SPECIFIC DIRECTIONAL TRACK
                std::lock_guard<std::mutex> track_lock(target_track->segment_lock);
                train->current_location = target_track->id;
                
                // DYNAMIC RADAR LOOP
                int elapsed = 0;
                while (true) {
                    if (train->is_aborted) return; 
                    while (is_paused || global_estop) {
                        if (train->is_aborted) return;
                        std::this_thread::sleep_for(std::chrono::milliseconds(100));
                    }
                    
                    // Calculate normal speed
                    // 1. Calculate normal speed based on train type
                    int current_target_speed = 12000;
                    if (train->type == "Express") current_target_speed = 7000; 
                    else if (train->type == "Freight") current_target_speed = 18000; 

                    // 2. Scan for Elephants!
                    // --- THE TRUE MID-TRACK HALT ---
                    while (target_track->has_animals) {
                        if (train->is_aborted) return;
                        std::this_thread::sleep_for(std::chrono::milliseconds(100));
                        // The thread is now literally frozen here until the elephant leaves!
                    }
                    
                    // Look Ahead Brakes (Slightly slow down if NEXT track has animals)
                    if (i + 1 < train->route.size()) {
                        std::string next_track_id = train->route[i] + "-" + train->route[i+1];
                        std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
                        if (NetworkGraph::tracks.count(next_track_id) && NetworkGraph::tracks[next_track_id]->has_animals) {
                            current_target_speed *= 2; 
                        }
                    }
                }
            }
            train->current_location = next_station;
        }

        if (!train->is_aborted) {
            std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
            active_trains.erase(train->id);
        }
    }

    void spawnTrain(std::string id, std::string type, int priority, std::vector<std::string> route, int sched_time_mins) {
        auto train = std::make_shared<Train>(id, type, priority, route, sched_time_mins);
        active_trains[id] = train;
        train_threads.emplace_back(std::thread(trainThreadFunction, train));
    }
}