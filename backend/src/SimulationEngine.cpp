#include "SimulationEngine.hpp"
#include "NetworkGraph.hpp"
#include <iostream>
#include <chrono>

namespace SimulationEngine {
    std::atomic<bool> is_simulation_running(true);
    std::unordered_map<std::string, std::shared_ptr<Train>> active_trains;
    std::vector<std::thread> train_threads;

    // This is the lifecycle of a single Train
    void trainThreadFunction(std::shared_ptr<Train> train) {
        std::cout << "[TRAIN] " << train->id << " (" << train->type << ") departing from " << train->current_location << "\n";

        // Loop through the train's requested route
        for (size_t i = 1; i < train->route.size(); ++i) {
            std::string next_station = train->route[i];
            std::shared_ptr<TrackSegment> target_track = nullptr;

            // 1. Find the track that connects our current location to the next station
            for (auto& track : NetworkGraph::stations[train->current_location]->connected_tracks) {
                if (track->target_id == next_station || track->source_id == next_station) {
                    target_track = track;
                    break;
                }
            }

            if (!target_track) break; // Dead end (shouldn't happen on our map)

            std::cout << "[TRAIN] " << train->id << " approaching segment: " << target_track->id << "\n";

            // 2. THE CRITICAL SECTION (Resource Locking)
            {
                // This line halts the thread if another train is already on the track
                std::unique_lock<std::mutex> lock(target_track->segment_lock);
                
                std::cout << "  >>> [LOCKED] " << train->id << " entered " << target_track->id << "!\n";

                // Simulate travel time based on track length and speed limit
                int travel_time_ms = (target_track->length_km * 100) / (target_track->max_speed > 0 ? target_track->max_speed : 1);
                
                // Sleep the thread to simulate the train moving
                std::this_thread::sleep_for(std::chrono::milliseconds(travel_time_ms * 10));

                train->current_location = next_station;
                std::cout << "  <<< [RELEASED] " << train->id << " cleared " << target_track->id << " and reached " << next_station << ".\n";
            } // The mutex lock is automatically released here when it goes out of scope!
        }

        std::cout << "[TRAIN] " << train->id << " arrived at final destination: " << train->current_location << "\n";
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