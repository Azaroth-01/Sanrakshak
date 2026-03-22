/* #include "WebServer.hpp"
#include "crow_all.h"
#include "json.hpp"
#include "NetworkGraph.hpp"
#include "SimulationEngine.hpp"
#include <iostream>
#include <mutex>
#include <unordered_set>
#include <thread>
#include <chrono>

namespace WebServer {
    std::mutex mtx;
    std::unordered_set<crow::websocket::connection*> users;

    std::string getMapDataJson() {
        nlohmann::json map_data;
        map_data["type"] = "MAP_LAYOUT";
        map_data["stations"] = nlohmann::json::array();
        map_data["tracks"] = nlohmann::json::array();

        std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
        for (const auto& pair : NetworkGraph::stations) {
            map_data["stations"].push_back({ {"id", pair.first}, {"name", pair.second->name} });
        }
        for (const auto& pair : NetworkGraph::tracks) {
            map_data["tracks"].push_back({
                {"id", pair.first}, {"src", pair.second->source_id},
                {"tgt", pair.second->target_id}, {"len", pair.second->length_km}
            });
        }
        return map_data.dump();
    }

    void setupRoutes(crow::SimpleApp& app) {
        CROW_ROUTE(app, "/")([](){ return "Sanrakshan Command Center is Online."; });

        CROW_WEBSOCKET_ROUTE(app, "/ws")
            .onopen([&](crow::websocket::connection& conn) {
                conn.send_text(getMapDataJson()); 
                std::lock_guard<std::mutex> lock(mtx);
                users.insert(&conn);
            })
            .onclose([&](crow::websocket::connection& conn, const std::string& reason, uint16_t code) {
                std::lock_guard<std::mutex> lock(mtx);
                users.erase(&conn);
            })
            .onmessage([&](crow::websocket::connection& , const std::string& data, bool is_binary) {
                try {
                    auto j = nlohmann::json::parse(data);
                    std::string action = j["action"];

                    if (action == "ADD_STATION") {
                        NetworkGraph::addStation(j["id"], j["name"]);
                    }
                    else if (action == "ADD_TRACK") {
                        std::string src = j["src"].get<std::string>();
                        std::string tgt = j["tgt"].get<std::string>();
                        int len = j["length"].get<int>();
                        
                        // Default to DOUBLE if mode is missing (for the Auto-Builder demo)
                        std::string mode = j.contains("mode") ? j["mode"].get<std::string>() : "DOUBLE";
                        
                        if (mode == "DOUBLE" || mode == "SINGLE_UP") {
                            NetworkGraph::addTrack(src + "-" + tgt, src, tgt, len, 100); // Forward Line
                        }
                        if (mode == "DOUBLE" || mode == "SINGLE_DN") {
                            NetworkGraph::addTrack(tgt + "-" + src, tgt, src, len, 100); // Reverse Line
                        }
                        
                    }
                    else if (action == "DELETE_STATION") {
                        std::string st_id = j["id"].get<std::string>();
                        std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                        for (auto it = NetworkGraph::tracks.begin(); it != NetworkGraph::tracks.end(); ) {
                            if (it->second->source_id == st_id || it->second->target_id == st_id) {
                                it = NetworkGraph::tracks.erase(it); 
                            } else { ++it; }
                        }
                        NetworkGraph::stations.erase(st_id);
                    }
                    else if (action == "DELETE_TRACK") {
                        std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                        NetworkGraph::tracks.erase(j["id"].get<std::string>());
                    }
                    else if (action == "SET_TIME") {
                        int h = j["hour"].get<int>();
                        int m = j["minute"].get<int>();
                        SimulationEngine::sim_time_mins = (h * 60) + m;
                        std::cout << "[SERVER] Clock manually set to " << h << ":" << m << std::endl;
                        return; // Prevent full map re-render
                    }
                    else if (action == "TOGGLE_SIMULATION") {
                        SimulationEngine::toggleSimulation();
                        return; 
                    }
                    else if (action == "RESET_SIMULATION") {
                        SimulationEngine::resetSimulation();
                        return; 
                    }
                    else if (action == "SMART_DISPATCH") {
                        std::string src = j["src"].get<std::string>();
                        std::string tgt = j["tgt"].get<std::string>();
                        std::string type = j["type"].get<std::string>();
                        std::string name = j["name"].get<std::string>(); 
                        int h = j["sched_hour"].get<int>(); 
                        int m = j["sched_min"].get<int>();
                        int sched_time_mins = (h * 60) + m; 
                        
                        std::vector<std::string> route = NetworkGraph::calculateShortestPath(src, tgt);
                        
                        // --- THE FIX: ROUTING ERROR CATCHER ---
                        if (route.size() >= 2) {
                            SimulationEngine::spawnTrain(name, type, 1, route, sched_time_mins);
                            std::cout << "[SERVER] Queued " << type << " '" << name << "' for Min " << sched_time_mins << " | Route: " << route.size() << " stops." << std::endl;
                        } else {
                            std::cout << "\n[CRITICAL ERROR] DISPATCH FAILED! No continuous track path exists from " << src << " to " << tgt << "!\n" << std::endl;
                        }
                        return;
                    }
                    else if (action == "SABOTAGE_TRACK") {
                        std::string track_id = j["id"].get<std::string>();
                        std::string src = track_id.substr(0, track_id.find('-'));
                        std::string tgt = track_id.substr(track_id.find('-') + 1);
                        std::string rev_id = tgt + "-" + src;

                        std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                        if (NetworkGraph::tracks.count(track_id)) NetworkGraph::tracks[track_id]->is_broken = true;
                        if (NetworkGraph::tracks.count(rev_id)) NetworkGraph::tracks[rev_id]->is_broken = true;
                        return;
                    }
                    else if (action == "E_STOP") {
                        bool state = j["state"].get<bool>();
                        SimulationEngine::global_estop = state;
                        std::string msg = nlohmann::json{{"type", "ESTOP_STATE"}, {"state", state}}.dump();
                        std::lock_guard<std::mutex> lock(mtx);
                        for (auto* c : users) c->send_text(msg);
                        return;
                    }

                    // Only broadcast structural layout changes if we reach here
                    std::string new_map = getMapDataJson();
                    std::lock_guard<std::mutex> lock(mtx);
                    for (auto* c : users) c->send_text(new_map);

                } catch (const std::exception& e) {
                    std::cerr << "[WS ERROR] Failed to parse UI command: " << e.what() << std::endl;
                }
            });
    }

    void startBroadcaster() {
        std::thread broadcaster([]() {
            while (true) {
                std::this_thread::sleep_for(std::chrono::milliseconds(200)); 
                if (users.empty()) continue;

                nlohmann::json payload;
                payload["type"] = "STATE_UPDATE";
                payload["trains"] = nlohmann::json::array();
                payload["locked_tracks"] = nlohmann::json::array(); 
                
                // --- CRITICAL CLOCK SYNC ---
               // --- CRITICAL CLOCK SYNC ---
                payload["sim_active"] = !SimulationEngine::is_paused.load(); // Send TRUE if running!
                payload["sim_time"] = SimulationEngine::sim_time_mins.load();
                // ---------------------------
                
                for (const auto& pair : SimulationEngine::active_trains) {
                    auto t = pair.second;
                    if (!t->has_departed) continue; // Keep sleeping trains hidden from the map!
                    payload["trains"].push_back({
                        {"id", t->id}, {"type", t->type}, {"loc", t->current_location}
                    });
                }

                std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                for (const auto& pair : NetworkGraph::tracks) {
                    auto track = pair.second;
                    if (!track->segment_lock.try_lock()) {
                        payload["locked_tracks"].push_back(track->id);
                    } else {
                        track->segment_lock.unlock(); 
                    }
                }

                std::string msg = payload.dump();
                std::lock_guard<std::mutex> lock(mtx);
                for (auto* conn : users) conn->send_text(msg);
            }
        });
        broadcaster.detach();
    }
} */
#include "WebServer.hpp"
#include "crow_all.h"
#include "json.hpp"
#include "NetworkGraph.hpp"
#include "SimulationEngine.hpp"
#include <iostream>
#include <mutex>
#include <unordered_set>
#include <thread>
#include <chrono>

namespace WebServer {
    std::mutex mtx;
    std::unordered_set<crow::websocket::connection*> users;

    std::string getMapDataJson() {
        nlohmann::json map_data;
        map_data["type"] = "MAP_LAYOUT";
        map_data["stations"] = nlohmann::json::array();
        map_data["tracks"] = nlohmann::json::array();

        std::lock_guard<std::mutex> lock(NetworkGraph::graph_mutex);
        for (const auto& pair : NetworkGraph::stations) {
            map_data["stations"].push_back({ {"id", pair.first}, {"name", pair.second->name} });
        }
        for (const auto& pair : NetworkGraph::tracks) {
            map_data["tracks"].push_back({
                {"id", pair.first}, {"src", pair.second->source_id},
                {"tgt", pair.second->target_id}, {"len", pair.second->length_km},
                {"is_broken", pair.second->is_broken} // THE FIX: Now sabotage survives map reloads!
            });
        }
        return map_data.dump();
    }

    void setupRoutes(crow::SimpleApp& app) {
        CROW_ROUTE(app, "/")([](){ return "Sanrakshan Command Center is Online."; });

        CROW_WEBSOCKET_ROUTE(app, "/ws")
            .onopen([&](crow::websocket::connection& conn) {
                conn.send_text(getMapDataJson()); 
                std::lock_guard<std::mutex> lock(mtx);
                users.insert(&conn);
            })
            .onclose([&](crow::websocket::connection& conn, const std::string& reason, uint16_t code) {
                std::lock_guard<std::mutex> lock(mtx);
                users.erase(&conn);
            })
            .onmessage([&](crow::websocket::connection& /*conn*/, const std::string& data, bool is_binary) {
                try {
                    auto j = nlohmann::json::parse(data);
                    std::string action = j["action"];

                    if (action == "ADD_STATION") {
                        NetworkGraph::addStation(j["id"], j["name"]);
                    }
                    else if (action == "ADD_TRACK") {
                        std::string src = j["src"].get<std::string>();
                        std::string tgt = j["tgt"].get<std::string>();
                        int len = j["length"].get<int>();
                        
                        // Default to DOUBLE if mode is missing (for the Auto-Builder demo)
                        std::string mode = j.contains("mode") ? j["mode"].get<std::string>() : "DOUBLE";
                        
                        if (mode == "DOUBLE" || mode == "SINGLE_UP") {
                            NetworkGraph::addTrack(src + "-" + tgt, src, tgt, len, 100); // Forward Line
                        }
                        if (mode == "DOUBLE" || mode == "SINGLE_DN") {
                            NetworkGraph::addTrack(tgt + "-" + src, tgt, src, len, 100); // Reverse Line
                        }
                    }
                    else if (action == "DELETE_STATION") {
                        std::string st_id = j["id"].get<std::string>();
                        std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                        for (auto it = NetworkGraph::tracks.begin(); it != NetworkGraph::tracks.end(); ) {
                            if (it->second->source_id == st_id || it->second->target_id == st_id) {
                                it = NetworkGraph::tracks.erase(it); 
                            } else { ++it; }
                        }
                        NetworkGraph::stations.erase(st_id);
                    }
                    else if (action == "DELETE_TRACK") {
                        std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                        NetworkGraph::tracks.erase(j["id"].get<std::string>());
                    }
                    else if (action == "SET_TIME") {
                        int h = j["hour"].get<int>();
                        int m = j["minute"].get<int>();
                        SimulationEngine::sim_time_mins = (h * 60) + m;
                        std::cout << "[SERVER] Clock manually set to " << h << ":" << m << std::endl;
                        return; // Prevent full map re-render
                    }
                    else if (action == "TOGGLE_SIMULATION") {
                        SimulationEngine::toggleSimulation();
                        return; 
                    }
                    else if (action == "RESET_SIMULATION") {
                        SimulationEngine::resetSimulation();
                        return; 
                    }
                    else if (action == "SMART_DISPATCH") {
                        std::string src = j["src"].get<std::string>();
                        std::string tgt = j["tgt"].get<std::string>();
                        std::string type = j["type"].get<std::string>();
                        std::string name = j["name"].get<std::string>(); 
                        int h = j["sched_hour"].get<int>(); 
                        int m = j["sched_min"].get<int>();
                        int sched_time_mins = (h * 60) + m; 
                        
                        std::vector<std::string> route = NetworkGraph::calculateShortestPath(src, tgt);
                        
                        // --- ROUTING ERROR CATCHER ---
                        if (route.size() >= 2) {
                            SimulationEngine::spawnTrain(name, type, 1, route, sched_time_mins);
                            std::cout << "[SERVER] Queued " << type << " '" << name << "' for Min " << sched_time_mins << " | Route: " << route.size() << " stops." << std::endl;
                        } else {
                            std::cout << "\n[CRITICAL ERROR] DISPATCH FAILED! No continuous track path exists from " << src << " to " << tgt << "!\n" << std::endl;
                        }
                        return;
                    }
                    else if (action == "SABOTAGE_TRACK") {
                        std::string track_id = j["id"].get<std::string>();
                        std::string src = track_id.substr(0, track_id.find('-'));
                        std::string tgt = track_id.substr(track_id.find('-') + 1);
                        std::string rev_id = tgt + "-" + src;

                        std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                        if (NetworkGraph::tracks.count(track_id)) NetworkGraph::tracks[track_id]->is_broken = true;
                        if (NetworkGraph::tracks.count(rev_id)) NetworkGraph::tracks[rev_id]->is_broken = true;
                        return;
                    }
                    else if (action == "TOGGLE_ANIMALS") {
                        // --- NEW: Toggle wildlife presence on a track (both directions) ---
                        std::string track_id = j["id"].get<std::string>();
                        std::string src = track_id.substr(0, track_id.find('-'));
                        std::string tgt = track_id.substr(track_id.find('-') + 1);
                        std::string rev_id = tgt + "-" + src;

                        std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                        if (NetworkGraph::tracks.count(track_id)) {
                            NetworkGraph::tracks[track_id]->has_animals = !NetworkGraph::tracks[track_id]->has_animals;
                        }
                        if (NetworkGraph::tracks.count(rev_id)) {
                            NetworkGraph::tracks[rev_id]->has_animals = !NetworkGraph::tracks[rev_id]->has_animals;
                        }
                        return; // Prevent full map re-render, Broadcaster handles visual state
                    }
                    else if (action == "E_STOP") {
                        bool state = j["state"].get<bool>();
                        SimulationEngine::global_estop = state;
                        std::string msg = nlohmann::json{{"type", "ESTOP_STATE"}, {"state", state}}.dump();
                        std::lock_guard<std::mutex> lock(mtx);
                        for (auto* c : users) c->send_text(msg);
                        return;
                    }

                    // Only broadcast structural layout changes if we reach here
                    std::string new_map = getMapDataJson();
                    std::lock_guard<std::mutex> lock(mtx);
                    for (auto* c : users) c->send_text(new_map);

                } catch (const std::exception& e) {
                    std::cerr << "[WS ERROR] Failed to parse UI command: " << e.what() << std::endl;
                }
            });
    }

    void startBroadcaster() {
        std::thread broadcaster([]() {
            while (true) {
                std::this_thread::sleep_for(std::chrono::milliseconds(200)); 
                if (users.empty()) continue;

                nlohmann::json payload;
                payload["type"] = "STATE_UPDATE";
                payload["trains"] = nlohmann::json::array();
                payload["locked_tracks"] = nlohmann::json::array(); 
                payload["animal_tracks"] = nlohmann::json::array(); // --- NEW: Track wildlife
                
                // --- CRITICAL CLOCK SYNC ---
                payload["sim_active"] = !SimulationEngine::is_paused.load(); // Send TRUE if running!
                payload["sim_time"] = SimulationEngine::sim_time_mins.load();
                // ---------------------------
                
                for (const auto& pair : SimulationEngine::active_trains) {
                    auto t = pair.second;
                    if (!t->has_departed) continue; // Keep sleeping trains hidden from the map!
                    payload["trains"].push_back({
                        // --- NEW: Sending the dynamic speed down to UI ---
                        {"id", t->id}, {"type", t->type}, {"loc", t->current_location}, {"speed", t->current_speed}, {"status", pair.second->status}
                    });
                }

                std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                for (const auto& pair : NetworkGraph::tracks) {
                    auto track = pair.second;
                    if (!track->segment_lock.try_lock()) {
                        payload["locked_tracks"].push_back(track->id);
                    } else {
                        track->segment_lock.unlock(); 
                    }
                    
                    // --- NEW: Tell UI if this track has animals ---
                    if (track->has_animals) {
                        payload["animal_tracks"].push_back(track->id);
                    }
                }

                std::string msg = payload.dump();
                std::lock_guard<std::mutex> lock(mtx);
                for (auto* conn : users) conn->send_text(msg);
            }
        });
        broadcaster.detach();
    }
}

