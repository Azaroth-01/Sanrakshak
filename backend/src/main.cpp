#include "WebServer.hpp"
#include "crow_all.h"
#include <iostream>

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "  SANRAKSHAN CTC ENGINE ONLINE" << std::endl;
    std::cout << "========================================" << std::endl;

    // 1. Start the Live Telemetry Broadcaster
    WebServer::startBroadcaster();

    // 2. Setup and Start the Crow Web Server
    crow::SimpleApp app;
    WebServer::setupRoutes(app);
    
    std::cout << "Listening for UI connections on port 8080..." << std::endl;
    app.port(8080).multithreaded().run();

    return 0;
}