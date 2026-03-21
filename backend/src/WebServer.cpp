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

    // Helper to send the map layout to the UI
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
        CROW_ROUTE(app, "/")([](){
            return "Sanrakshan Command Center is Online.";
        });

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
                        std::cout << "[SERVER] UI Built Station: " << j["id"] << std::endl;
                    }
                    else if (action == "ADD_TRACK") {
                        std::string track_id = j["src"].get<std::string>() + "-" + j["tgt"].get<std::string>();
                        NetworkGraph::addTrack(track_id, j["src"], j["tgt"], j["length"], 100);
                        std::cout << "[SERVER] UI Laid Track: " << track_id << std::endl;
                    }
                    else if (action == "DELETE_STATION") {
                        std::string st_id = j["id"].get<std::string>();
                        std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                        
                        // CASCADING DELETE: Destroy all tracks connected to this station first!
                        // We have to use an iterator because we are modifying the map while reading it
                        for (auto it = NetworkGraph::tracks.begin(); it != NetworkGraph::tracks.end(); ) {
                            if (it->second->source_id == st_id || it->second->target_id == st_id) {
                                std::cout << "[SERVER] Auto-deleted orphaned track: " << it->first << std::endl;
                                it = NetworkGraph::tracks.erase(it); // Erase and get the next valid item
                            } else {
                                ++it; // Move to the next track
                            }
                        }

                        // Now that the tracks are gone, it is safe to delete the station
                        NetworkGraph::stations.erase(st_id);
                        std::cout << "[SERVER] UI Deleted Station: " << st_id << std::endl;
                    }
                    else if (action == "DELETE_TRACK") {
                        std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                        NetworkGraph::tracks.erase(j["id"].get<std::string>());
                        std::cout << "[SERVER] UI Deleted Track: " << j["id"] << std::endl;
                    }
                    else if (action == "SMART_DISPATCH") {
                        std::string src = j["src"].get<std::string>();
                        std::string tgt = j["tgt"].get<std::string>();
                        std::string type = j["type"].get<std::string>(); // Express, Local, Freight
                        std::string name = j["name"].get<std::string>(); 
                        
                        std::vector<std::string> route = NetworkGraph::calculateShortestPath(src, tgt);
                        if (route.size() < 2) return;

                        SimulationEngine::spawnTrain(name, type, 1, route);
                        std::cout << "[SERVER] Dispatched " << type << " '" << name << "' via A.I. Route." << std::endl;
                    }
                    else if (action == "SABOTAGE_TRACK") {
                        std::string track_id = j["id"].get<std::string>();
                        std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                        if (NetworkGraph::tracks.count(track_id)) {
                            NetworkGraph::tracks[track_id]->is_broken = true;
                            std::cout << "[CRITICAL ALARM] Track " << track_id << " SABOTAGED!\n";
                        }
                    }
                    else if (action == "E_STOP") {
                        bool state = j["state"].get<bool>();
                        SimulationEngine::global_estop = state;
                        std::cout << "\n====================================\n";
                        std::cout << "[SYSTEM] EMERGENCY STOP " << (state ? "ENGAGED" : "LIFTED") << "!\n";
                        std::cout << "====================================\n";
                        
                        // Tell the UI to flash red
                        std::string msg = nlohmann::json{{"type", "ESTOP_STATE"}, {"state", state}}.dump();
                        std::lock_guard<std::mutex> lock(mtx);
                        for (auto* c : users) c->send_text(msg);
                    }
                    else if (action == "SPAWN_TRAIN") {
                        static int dynamic_counter = 900;
                        std::string t_id = "UI-" + std::to_string(dynamic_counter++);
                        std::vector<std::string> route;
                        for (auto& st : j["route"]) route.push_back(st);
                        SimulationEngine::spawnTrain(t_id, "Express", 1, route);
                        std::cout << "[SERVER] UI Dispatched Train: " << t_id << std::endl;
                        return; // Don't broadcast map data if we just spawned a train
                    }

                    // If we made it here, infrastructure changed! Broadcast the new map.
                    std::string new_map = getMapDataJson();
                    std::lock_guard<std::mutex> lock(mtx);
                    for (auto* c : users) {
                        c->send_text(new_map);
                    }

                } catch (const std::exception& e) {
                    std::cerr << "[WS ERROR] Failed to parse UI command: " << e.what() << std::endl;
                }
            });
    }

    void startBroadcaster() {
        std::thread broadcaster([]() {
            while (true) {
                std::this_thread::sleep_for(std::chrono::milliseconds(200)); // Faster 200ms updates for SCADA smoothness
                if (users.empty()) continue;

                nlohmann::json payload;
                payload["type"] = "STATE_UPDATE";
                payload["trains"] = nlohmann::json::array();
                payload["locked_tracks"] = nlohmann::json::array(); // NEW: Track Signals!

                // 1. Get Train Positions
                for (const auto& pair : SimulationEngine::active_trains) {
                    auto t = pair.second;
                    payload["trains"].push_back({
                        {"id", t->id}, {"type", t->type}, {"loc", t->current_location}
                    });
                }

                // 2. Detect which tracks are currently locked by a train
                std::lock_guard<std::mutex> graph_lock(NetworkGraph::graph_mutex);
                for (const auto& pair : NetworkGraph::tracks) {
                    auto track = pair.second;
                    // Try to lock it. If we fail, it means a train is currently on it!
                    if (!track->segment_lock.try_lock()) {
                        payload["locked_tracks"].push_back(track->id);
                    } else {
                        track->segment_lock.unlock(); // Release it immediately
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