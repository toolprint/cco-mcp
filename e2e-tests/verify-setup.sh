#!/bin/bash

# Simple verification script to test e2e setup

set -e

echo "Verifying E2E Test Setup..."

# Check if CCO-MCP is running
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8660/health | grep -q "200"; then
    echo "✓ CCO-MCP server is running on port 8660"
else
    echo "✗ CCO-MCP server is not running"
    echo "  Please start it with: pnpm dev"
    exit 1
fi

# Check if claude-task is available
if command -v ct >/dev/null 2>&1; then
    echo "✓ claude-task (ct) is available"
    ct --version
elif npx -y claude-task --version >/dev/null 2>&1; then
    echo "✓ claude-task is available via npx"
else
    echo "✗ claude-task is not available"
    echo "  Install with: npm install -g claude-task"
    exit 1
fi

# Check if Docker is running
if docker info >/dev/null 2>&1; then
    echo "✓ Docker is running"
else
    echo "✗ Docker is not running"
    echo "  Please start Docker"
    exit 1
fi

# Check environment variables
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "✓ ANTHROPIC_API_KEY is set"
else
    echo "✗ ANTHROPIC_API_KEY is not set"
    echo "  Please set your Anthropic API key"
fi

echo ""
echo "Setup verification complete!"
echo "You can now run: ./run-test.sh"