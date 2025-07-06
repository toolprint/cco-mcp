#!/bin/bash

# CCO-MCP E2E Recording Setup Script
# This script ensures all dependencies are installed for recording

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         CCO-MCP E2E Recording Setup                       ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Install main project dependencies
echo -e "${YELLOW}Installing main project dependencies...${NC}"
cd "$PROJECT_ROOT"
pnpm install

# Install UI dependencies
echo -e "${YELLOW}Installing UI dependencies...${NC}"
cd "$PROJECT_ROOT/ui"
pnpm install

# Install Playwright browsers
echo -e "${YELLOW}Installing Playwright browsers...${NC}"
cd "$PROJECT_ROOT"
pnpm playwright:install

# Create recordings directory
echo -e "${YELLOW}Creating recordings directory...${NC}"
mkdir -p "$SCRIPT_DIR/recordings"

# Make scripts executable
echo -e "${YELLOW}Making scripts executable...${NC}"
chmod +x "$SCRIPT_DIR/run-test-with-recording.sh"
chmod +x "$SCRIPT_DIR/run-test.sh"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}         Setup completed successfully!                     ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "You can now run the recording tests with:"
echo "  ./run-test-with-recording.sh"
echo ""
echo "Or from the parent directory:"
echo "  pnpm test:e2e:record"
echo ""