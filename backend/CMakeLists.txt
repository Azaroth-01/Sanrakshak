cmake_minimum_required(VERSION 3.15)
project(SanrakshanEngine)

# Require C++17 for modern threading and smart pointers
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find standard threading libraries (Crucial for std::thread and Crow)
find_package(Threads REQUIRED)

# Tell CMake where to look for our header files (crow_all.h, json.hpp, etc.)
include_directories(${CMAKE_SOURCE_DIR}/include)

# Define our executable. 
# Note: We are only compiling main.cpp for now. We will uncomment the others later.
add_executable(sanrakshan_server 
    src/main.cpp
    src/NetworkGraph.cpp     
     src/SimulationEngine.cpp 
     src/WebServer.cpp        
)

# Link the threading library to our executable
target_link_libraries(sanrakshan_server PRIVATE Threads::Threads)