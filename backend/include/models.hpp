#pragma once
#include <string>
#include <vector>
#include <memory>
#include <mutex>
#include <atomic>

struct TrackSegment {
    std::string id;
    std::string source_id;
    std::string target_id;
    int length_km;
    int max_speed;
    std::mutex segment_lock;
    bool is_broken = false; 
    bool has_animals = false;
    
    TrackSegment(std::string id, std::string src, std::string tgt, int len, int spd)
        : id(id), source_id(src), target_id(tgt), length_km(len), max_speed(spd) {}
};

struct Station {
    std::string id;
    std::string name;
    std::vector<std::shared_ptr<TrackSegment>> connected_tracks;
    Station(std::string i, std::string n) : id(i), name(n) {}
};

struct Train {
    std::string id;
    std::string type; 
    int priority;     
    int current_speed;
    std::string current_location; 
    std::vector<std::string> route; 
    
    int scheduled_time_mins; 
    bool has_departed;
    std::atomic<bool> is_aborted; // NEW: Safely kills the thread on Reset

    Train(std::string i, std::string t, int p, std::vector<std::string> r, int st_mins) 
        : id(i), type(t), priority(p), current_speed(0), current_location(r.front()), route(r), scheduled_time_mins(st_mins), has_departed(false), is_aborted(false) {}
};