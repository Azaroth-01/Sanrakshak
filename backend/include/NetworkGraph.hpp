#pragma once

#include "models.hpp"
#include <unordered_map>
#include <string>
#include <memory>

namespace NetworkGraph {
    // Global Maps holding our infrastructure
    extern std::unordered_map<std::string, std::shared_ptr<Station>> stations;
    extern std::unordered_map<std::string, std::shared_ptr<TrackSegment>> tracks;
    std::vector<std::string> calculateShortestPath(const std::string& src, const std::string& tgt);

    // Master lock for Feature 8: Infrastructure Builder (Stop the world)
    extern std::mutex graph_mutex;

    // Initialization Function
    void initializeMumbaiPuneNetwork();

    // Infrastructure Builder Functions (Called via JSON from UI)
    void addStation(const std::string& id, const std::string& name);
    void addTrack(const std::string& id, const std::string& src, const std::string& tgt, int length, int speed);
}