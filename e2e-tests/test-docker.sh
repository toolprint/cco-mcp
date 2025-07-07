#!/bin/bash

echo "Testing Docker connectivity..."
echo ""

echo "1. Docker contexts:"
docker context ls || echo "Failed to list contexts"
echo ""

echo "2. Current context:"
docker context show || echo "Failed to show current context"
echo ""

echo "3. Docker version:"
docker version || echo "Failed to get docker version"
echo ""

echo "4. Docker info:"
docker info 2>&1 | head -5 || echo "Failed to get docker info"
echo ""

echo "5. Environment variables:"
echo "DOCKER_HOST=$DOCKER_HOST"
echo "HOME=$HOME"
echo ""

echo "6. Testing with different socket paths:"
DOCKER_HOST="unix://$HOME/.docker/run/docker.sock" docker ps 2>&1 | head -5 || echo "Failed with user socket"
echo ""

echo "7. Check if Docker Desktop is running:"
if pgrep -x "Docker" > /dev/null; then
    echo "Docker Desktop process is running"
else
    echo "Docker Desktop process is NOT running"
fi