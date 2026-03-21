#include "NetworkGraph.hpp"
#include <iostream>

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
}