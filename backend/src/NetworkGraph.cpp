#include "NetworkGraph.hpp"
#include <iostream>
#include <queue>
#include <limits>
#include <algorithm>

namespace NetworkGraph {
    // 1. Define the global variables that were declared 'extern' in the header
    std::unordered_map<std::string, std::shared_ptr<Station>> stations;
    std::unordered_map<std::string, std::shared_ptr<TrackSegment>> tracks;
    std::mutex graph_mutex;

    // 2. Helper to safely add a station
    void addStation(const std::string& id, const std::string& name) {
        std::lock_guard<std::mutex> lock(graph_mutex);
        stations[id] = std::make_shared<Station>(id, name);
        std::cout << "  [+] Station: " << id << " (" << name << ")" << std::endl;
    }

    // 3. Helper to safely add a track and link it to the stations
    void addTrack(const std::string& id, const std::string& src, const std::string& tgt, int length, int speed) {
        std::lock_guard<std::mutex> lock(graph_mutex);
        auto track = std::make_shared<TrackSegment>(id, src, tgt, length, speed);
        tracks[id] = track;
        
        // Link the track to the stations so trains know where they can go
        if (stations.count(src)) stations[src]->connected_tracks.push_back(track);
        if (stations.count(tgt)) stations[tgt]->connected_tracks.push_back(track);
        
        std::cout << "  [+] Track:   " << id << " [" << length << "km, Max " << speed << "km/h]" << std::endl;
    }

    // 4. The main initialization function for the Hackathon Demo
    void initializeMumbaiPuneNetwork() {
        std::cout << "\n[GRAPH] Initializing Mumbai-Pune Network (Bhor Ghat Route)..." << std::endl;
        
        // --- STATIONS ---
        addStation("CSMT", "Chhatrapati Shivaji Maharaj Terminus");
        addStation("DR", "Dadar");
        addStation("TNA", "Thane");
        addStation("KYN", "Kalyan Junction");
        addStation("KJT", "Karjat (Base of Ghats)");
        addStation("LNL", "Lonavala (Top of Ghats)");
        addStation("PUNE", "Pune Junction");

        // --- TRACKS ---
        std::cout << "\n[GRAPH] Laying down tracks..." << std::endl;
        addTrack("CSMT-DR", "CSMT", "DR", 9, 100);
        addTrack("DR-TNA", "DR", "TNA", 24, 100);
        addTrack("TNA-KYN", "TNA", "KYN", 20, 100);
        addTrack("KYN-KJT", "KYN", "KJT", 47, 80);
        
        // THE BOTTLENECK: Bhor Ghat (Very slow, high congestion!)
        addTrack("KJT-LNL", "KJT", "LNL", 28, 40); 
        
        addTrack("LNL-PUNE", "LNL", "PUNE", 64, 110);
        
        std::cout << "[GRAPH] Network Ready: " << stations.size() << " stations, " << tracks.size() << " tracks.\n" << std::endl;
    }

    // --- DIJKSTRA'S ALGORITHM IMPLEMENTATION ---
    std::vector<std::string> calculateShortestPath(const std::string& src, const std::string& tgt) {
        std::unordered_map<std::string, int> distances;
        std::unordered_map<std::string, std::string> previous;
        
        // Priority queue to get the node with the shortest distance
        auto cmp = [&distances](const std::string& left, const std::string& right) { return distances[left] > distances[right]; };
        std::priority_queue<std::string, std::vector<std::string>, decltype(cmp)> queue(cmp);

        std::lock_guard<std::mutex> lock(graph_mutex);

        // Initialize distances to infinity
        for (const auto& pair : stations) {
            distances[pair.first] = std::numeric_limits<int>::max();
        }
        
        distances[src] = 0;
        queue.push(src);

        while (!queue.empty()) {
            std::string current = queue.top();
            queue.pop();

            if (current == tgt) break; // Reached destination!

            for (const auto& track : stations[current]->connected_tracks) {
                if (track->is_broken) continue; // NEW: AI Router ignores destroyed tracks!

                std::string neighbor = (track->source_id == current) ? track->target_id : track->source_id;
                int alt = distances[current] + track->length_km;
                
                if (alt < distances[neighbor]) {
                    distances[neighbor] = alt;
                    previous[neighbor] = current;
                    queue.push(neighbor);
                }
            }
        }

        // Backtrack to build the route
        std::vector<std::string> path;
        for (std::string at = tgt; at != ""; at = previous[at]) {
            path.push_back(at);
            if (at == src) break;
        }
        std::reverse(path.begin(), path.end());
        
        if (path.size() > 0 && path[0] == src) return path;
        return {}; // Return empty if no path exists
    }
}