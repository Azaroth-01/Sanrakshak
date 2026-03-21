#pragma once

#include "crow_all.h"
#include <string>

namespace WebServer {
    // 1. Configures the HTTP and WebSocket routes
    void setupRoutes(crow::SimpleApp& app);

    // 2. Starts the background thread that sends JSON updates
    void startBroadcaster();

    // 3. Helper function to generate the map layout JSON
    std::string getMapDataJson();
}