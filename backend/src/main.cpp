#include "crow_all.h"
#include "NetworkGraph.hpp"
#include "SimulationEngine.hpp"
#include "WebServer.hpp"
#include <iostream>

int main() {
    crow::SimpleApp app;

    std::cout << "==========================================" << std::endl;
    std::cout << "[SYSTEM] Booting Sanrakshan Engine..." << std::endl;
    std::cout << "==========================================" << std::endl;

    // --- 1. INITIALIZE DATA ---
    NetworkGraph::initializeMumbaiPuneNetwork();
    
    // --- 2. START BACKGROUND THREADS ---
    SimulationEngine::startEngine();
    WebServer::startBroadcaster();

    // --- 3. CONFIGURE WEB SERVER & RUN ---
    WebServer::setupRoutes(app);
    app.port(8080).multithreaded().run();

    return 0;
}