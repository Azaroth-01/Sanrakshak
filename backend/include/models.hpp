#pragma once

#include <string>
#include <vector>
#include <memory>
#include <mutex>

// The Shared Resource
struct TrackSegment {
        std::string id;
        std::string source_id;
        std::string target_id;
        int length_km;
        int max_speed;
        std::mutex segment_lock;
        bool is_broken = false; // NEW: Fault Injection Flag
        
        TrackSegment(std::string id, std::string src, std::string tgt, int len, int spd)
            : id(id), source_id(src), target_id(tgt), length_km(len), max_speed(spd) {}
    };

// The Node
struct Station {
    std::string id;
    std::string name;
    std::vector<std::shared_ptr<TrackSegment>> connected_tracks;

    Station(std::string i, std::string n) : id(i), name(n) {}
};

// The Active Agent
struct Train {
    std::string id;
    std::string type; // "Express", "Freight", "Local"
    int priority;     // 1 = Highest, 4 = Lowest
    int current_speed;
    std::string current_location; // ID of station or track
    
    // The path the train wants to take (List of Station IDs)
    std::vector<std::string> route; 
    
    Train(std::string i, std::string t, int p, std::vector<std::string> r) 
        : id(i), type(t), priority(p), current_speed(0), current_location(r.front()), route(r) {}
};