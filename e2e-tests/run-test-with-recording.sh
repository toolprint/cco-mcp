#!/bin/bash

# CCO-MCP E2E Test Recording Script
# This script orchestrates UI and terminal recording while running e2e tests

set -e

# Parse command line arguments
RECORD_BROWSER=false
RECORD_TERMINAL=false
RECORDING_MODE="quick"  # Default to quick mode
OUTPUT_FORMAT="gif"     # Default to GIF for non-production

# Function to show usage
show_usage() {
    echo "Usage: $0 [-b|--browser] [-t|--terminal] [--production] [--webm|--webp] [-h|--help]"
    echo ""
    echo "Options:"
    echo "  -b, --browser     Enable browser/UI recording"
    echo "  -t, --terminal    Enable terminal recording (default: quick mode)"
    echo ""
    echo "Terminal Recording Modes:"
    echo "  (default)        Quick demo mode (small GIF, fast render)"
    echo "                   - Quality: 60, Frame rate: ~10fps, Size: 120x30"
    echo "  --production     Production demo mode (high quality)"
    echo "                   - Quality: 90, Frame rate: ~20fps, Size: 140x35"
    echo ""
    echo "Output Formats (production mode only):"
    echo "  --webm           Convert to WebM (best compression)"
    echo "  --webp           Convert to WebP (good compression, wide support)"
    echo "                   Note: GIF is always created first"
    echo ""
    echo "Other Options:"
    echo "  -h, --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -b                        # Record only browser/UI"
    echo "  $0 -t                        # Record terminal in quick mode (default)"
    echo "  $0 -t --production           # Record terminal in production mode (GIF only)"
    echo "  $0 -t --production --webm    # Record terminal in production mode + convert to WebM"
    echo "  $0 -t --production --webp    # Record terminal in production mode + convert to WebP"
    echo "  $0 -b -t --production        # Record both browser and terminal (production)"
    echo "  $0                           # Run tests without any recording"
    echo ""
    echo "FFmpeg Requirement:"
    echo "  For WebM/WebP conversion, install FFmpeg: brew install ffmpeg"
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -b|--browser)
            RECORD_BROWSER=true
            shift
            ;;
        -t|--terminal)
            RECORD_TERMINAL=true
            shift
            ;;
        --production)
            RECORDING_MODE="production"
            OUTPUT_FORMAT="gif"  # Reset to GIF for production
            shift
            ;;
        --webm)
            OUTPUT_FORMAT="webm"
            shift
            ;;
        --webp)
            OUTPUT_FORMAT="webp"
            shift
            ;;
        -h|--help)
            show_usage
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            ;;
    esac
done

# Validate format options are only used with production mode
if [ "$OUTPUT_FORMAT" != "gif" ] && [ "$RECORDING_MODE" != "production" ]; then
    echo "Error: --webm and --webp options are only valid with --production mode"
    show_usage
fi

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECORDINGS_DIR="${SCRIPT_DIR}/recordings"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SESSION_DIR="${RECORDINGS_DIR}/session-${TIMESTAMP}"
UI_RECORDING="${SESSION_DIR}/ui-recording.webm"
TERMINAL_RECORDING="${SESSION_DIR}/terminal-recording"
LOG_FILE="${SESSION_DIR}/test-run.log"

# Process IDs for cleanup
BACKEND_PID=""
FRONTEND_PID=""
UI_RECORDER_PID=""
TERMINALIZER_PID=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
    echo -e "${YELLOW}Cleaning up processes...${NC}"
    
    # Stop recording processes
    if [ -n "$UI_RECORDER_PID" ] && kill -0 $UI_RECORDER_PID 2>/dev/null; then
        echo "Stopping UI recorder..."
        kill -SIGINT $UI_RECORDER_PID 2>/dev/null || true
        wait $UI_RECORDER_PID 2>/dev/null || true
    fi
    
    if [ -n "$TERMINALIZER_PID" ] && kill -0 $TERMINALIZER_PID 2>/dev/null; then
        echo "Stopping terminal recorder..."
        kill -SIGINT $TERMINALIZER_PID 2>/dev/null || true
        wait $TERMINALIZER_PID 2>/dev/null || true
    fi
    
    # Stop services
    if [ -n "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "Stopping frontend..."
        kill -SIGTERM $FRONTEND_PID 2>/dev/null || true
    fi
    
    if [ -n "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        echo "Stopping backend..."
        kill -SIGTERM $BACKEND_PID 2>/dev/null || true
    fi
    
    # Kill any remaining processes on the ports
    lsof -ti:8660 | xargs kill -9 2>/dev/null || true
    lsof -ti:5180 | xargs kill -9 2>/dev/null || true
    
    echo -e "${GREEN}Cleanup completed${NC}"
}

# Set up signal handlers
trap cleanup EXIT INT TERM

# Create session directory
mkdir -p "$SESSION_DIR"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         CCO-MCP E2E Test Recording Session                ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "Timestamp: ${TIMESTAMP}"
if [ "$RECORD_BROWSER" = true ] || [ "$RECORD_TERMINAL" = true ]; then
    echo -e "Recordings will be saved to: ${SESSION_DIR}"
    echo -e "Recording options:"
    [ "$RECORD_BROWSER" = true ] && echo -e "  ${GREEN}✓${NC} Browser/UI recording enabled"
    [ "$RECORD_BROWSER" = false ] && echo -e "  ${YELLOW}✗${NC} Browser/UI recording disabled"
    if [ "$RECORD_TERMINAL" = true ]; then
        echo -e "  ${GREEN}✓${NC} Terminal recording enabled"
        echo -e "    Mode: ${RECORDING_MODE}"
        if [ "$RECORDING_MODE" = "production" ] && [ "$OUTPUT_FORMAT" != "gif" ]; then
            echo -e "    Output: ${OUTPUT_FORMAT} (requires FFmpeg)"
        else
            echo -e "    Output: GIF"
        fi
    else
        echo -e "  ${YELLOW}✗${NC} Terminal recording disabled"
    fi
else
    echo -e "${YELLOW}No recording options enabled. Running tests without recording.${NC}"
fi
echo ""

# Check if dependencies are installed
echo -e "${YELLOW}Checking dependencies...${NC}"

# Check main project dependencies
if [ ! -d "$SCRIPT_DIR/../node_modules" ]; then
    echo -e "${RED}Error: node_modules not found in main project!${NC}"
    echo -e "${YELLOW}Please run 'pnpm install' in the project root directory${NC}"
    exit 1
fi

# Check UI dependencies
if [ ! -d "$SCRIPT_DIR/../ui/node_modules" ]; then
    echo -e "${RED}Error: node_modules not found in ui directory!${NC}"
    echo -e "${YELLOW}Please run 'pnpm install' in the ui directory${NC}"
    exit 1
fi

# Check FFmpeg if needed for video conversion
if [ "$RECORD_TERMINAL" = true ] && [ "$RECORDING_MODE" = "production" ] && [ "$OUTPUT_FORMAT" != "gif" ]; then
    if ! command -v ffmpeg >/dev/null 2>&1; then
        echo -e "${RED}Error: FFmpeg is required for ${OUTPUT_FORMAT} conversion but not found!${NC}"
        echo -e "${YELLOW}Install FFmpeg on macOS with: brew install ffmpeg${NC}"
        echo -e "${YELLOW}Or use --gif flag to keep GIF format without conversion${NC}"
        exit 1
    else
        echo -e "${GREEN}FFmpeg verified ✓${NC}"
    fi
fi

echo -e "${GREEN}Dependencies verified ✓${NC}"
echo ""

# Start backend service in auto-approve mode for testing
echo -e "${YELLOW}Starting backend service (auto-approve mode)...${NC}"
cd "$SCRIPT_DIR/.."
pnpm dev:auto-approve > "${SESSION_DIR}/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo -n "Waiting for backend to start"
for i in {1..30}; do
    if curl -s http://localhost:8660/mcp >/dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

if ! curl -s http://localhost:8660/mcp >/dev/null 2>&1; then
    echo -e " ${RED}✗${NC}"
    echo -e "${RED}Backend failed to start!${NC}"
    exit 1
fi

# Start frontend service
echo -e "${YELLOW}Starting frontend service...${NC}"
pnpm dev:ui > "${SESSION_DIR}/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

# Wait for frontend to be ready (Vite configured to run on port 5180)
echo -n "Waiting for frontend to start"
for i in {1..60}; do
    if curl -s http://localhost:5180 >/dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

if ! curl -s http://localhost:5180 >/dev/null 2>&1; then
    echo -e " ${YELLOW}⚠${NC}"
    echo -e "${YELLOW}Frontend may not be fully ready, but continuing...${NC}"
fi

# Give services a moment to fully initialize
sleep 2

# Start UI recording if enabled
if [ "$RECORD_BROWSER" = true ]; then
    echo -e "${YELLOW}Starting UI recording...${NC}"
    cd "$SCRIPT_DIR"
    # Run recording for up to 10 minutes (600000ms)
    node record-ui.js "$UI_RECORDING" 600000 &
    UI_RECORDER_PID=$!
    echo "UI Recorder PID: $UI_RECORDER_PID"
    
    # Give UI recorder time to initialize
    sleep 3
fi

# Check if terminal recording is requested and dependencies are available
if [ "$RECORD_TERMINAL" = true ]; then
    cd "$SCRIPT_DIR/.."
    if ! pnpm exec terminalizer --version &> /dev/null; then
        echo -e "${YELLOW}Warning: Terminalizer not found. Terminal recording will be skipped.${NC}"
        echo -e "${YELLOW}To enable terminal recording, run: pnpm install${NC}"
        SKIP_TERMINAL_RECORDING=true
    else
        # Check if script command is available (required for PTY)
        if ! command -v script >/dev/null 2>&1; then
            echo -e "${YELLOW}Warning: 'script' command not found. Terminal recording will be skipped.${NC}"
            echo -e "${YELLOW}Terminal recording requires the 'script' command for PTY emulation.${NC}"
            SKIP_TERMINAL_RECORDING=true
        else
            SKIP_TERMINAL_RECORDING=false
        fi
    fi
    
    # Start terminal recording
    echo -e "${YELLOW}Preparing terminal recording...${NC}"
    cd "$SCRIPT_DIR"
else
    SKIP_TERMINAL_RECORDING=true
fi

# Select appropriate config file based on recording mode
if [ "$RECORD_TERMINAL" = true ]; then
    case "$RECORDING_MODE" in
        quick)
            TERMINAL_CONFIG="terminalizer-quick.yml"
            echo -e "${BLUE}Using quick demo mode configuration${NC}"
            ;;
        production)
            TERMINAL_CONFIG="terminalizer-production.yml"
            echo -e "${BLUE}Using production demo mode configuration${NC}"
            ;;
    esac
fi

# Run tests with or without terminal recording
if [ "$SKIP_TERMINAL_RECORDING" = false ]; then
    echo -e "${YELLOW}Starting terminal recording...${NC}"
    cd "$SCRIPT_DIR"
    # Use our helper script to record the terminal session with proper config
    ./record-terminal.sh "${TERMINAL_RECORDING}.yml" "${SCRIPT_DIR}/run-test.sh" "$TERMINAL_CONFIG"
    TEST_EXIT_CODE=$?
else
    echo -e "${BLUE}Running E2E tests (without terminal recording)...${NC}"
    cd "$SCRIPT_DIR"
    ./run-test.sh
    TEST_EXIT_CODE=$?
fi

# Stop UI recording if it was started
if [ "$RECORD_BROWSER" = true ]; then
    echo -e "${YELLOW}Stopping UI recording...${NC}"
    if [ -n "$UI_RECORDER_PID" ] && kill -0 $UI_RECORDER_PID 2>/dev/null; then
        kill -SIGINT $UI_RECORDER_PID
        # Give it time to save the video
        sleep 5
    fi
fi

# Render terminal recording to GIF if available
if [ "$RECORD_TERMINAL" = true ] && [ "$SKIP_TERMINAL_RECORDING" = false ] && [ -f "${TERMINAL_RECORDING}.yml" ]; then
    echo -e "${YELLOW}Rendering terminal recording...${NC}"
    
    # Use the dedicated render script
    cd "$SCRIPT_DIR"
    # Run the render script and capture only the final output path (last line)
    RENDER_OUTPUT=$(./render-terminal-recording.sh "${TERMINAL_RECORDING}.yml" \
        --format "$OUTPUT_FORMAT" \
        --mode "$RECORDING_MODE" 2>&1)
    FINAL_OUTPUT=$(echo "$RENDER_OUTPUT" | tail -1)
    
    # The render script outputs the final file path on the last line
    if [ -f "$FINAL_OUTPUT" ]; then
        echo -e "${GREEN}Terminal recording rendered successfully${NC}"
    else
        echo -e "${RED}Terminal recording render failed${NC}"
        FINAL_OUTPUT=""
    fi
fi

# Generate summary report
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}" | tee "$LOG_FILE"
echo -e "${BLUE}         Recording Session Summary                         ${NC}" | tee -a "$LOG_FILE"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Timestamp: ${TIMESTAMP}" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Recordings created:" | tee -a "$LOG_FILE"

if [ "$RECORD_BROWSER" = true ] && [ -f "$UI_RECORDING" ]; then
    UI_SIZE=$(du -h "$UI_RECORDING" | cut -f1)
    echo -e "  ${GREEN}✓${NC} UI Recording: $UI_RECORDING (${UI_SIZE})" | tee -a "$LOG_FILE"
elif [ "$RECORD_BROWSER" = true ]; then
    # Check if there's a WebM file with a different name (created in last 5 minutes)
    WEBM_FILE=$(find "$SESSION_DIR" -name "*.webm" -mmin -5 2>/dev/null | head -1)
    if [ -n "$WEBM_FILE" ]; then
        UI_SIZE=$(du -h "$WEBM_FILE" | cut -f1)
        echo -e "  ${GREEN}✓${NC} UI Recording: $WEBM_FILE (${UI_SIZE})" | tee -a "$LOG_FILE"
    else
        echo -e "  ${RED}✗${NC} UI Recording: Failed to create" | tee -a "$LOG_FILE"
    fi
fi

if [ "$RECORD_TERMINAL" = true ]; then
    if [ -f "${TERMINAL_RECORDING}.yml" ]; then
        TERM_SIZE=$(du -h "${TERMINAL_RECORDING}.yml" | cut -f1)
        echo -e "  ${GREEN}✓${NC} Terminal Recording: ${TERMINAL_RECORDING}.yml (${TERM_SIZE})" | tee -a "$LOG_FILE"
    else
        if [ "$SKIP_TERMINAL_RECORDING" = true ]; then
            echo -e "  ${YELLOW}⚠${NC} Terminal Recording: Skipped (dependencies missing)" | tee -a "$LOG_FILE"
        else
            echo -e "  ${RED}✗${NC} Terminal Recording: Failed to create" | tee -a "$LOG_FILE"
        fi
    fi
fi

if [ "$RECORD_TERMINAL" = true ]; then
    if [ -n "$FINAL_OUTPUT" ] && [ -f "$FINAL_OUTPUT" ]; then
        OUTPUT_SIZE=$(du -h "$FINAL_OUTPUT" | cut -f1)
        OUTPUT_EXT="${FINAL_OUTPUT##*.}"
        OUTPUT_EXT_UPPER=$(echo "$OUTPUT_EXT" | tr '[:lower:]' '[:upper:]')
        echo -e "  ${GREEN}✓${NC} Terminal ${OUTPUT_EXT_UPPER}: $FINAL_OUTPUT (${OUTPUT_SIZE})" | tee -a "$LOG_FILE"
    else
        if [ "$SKIP_TERMINAL_RECORDING" = true ]; then
            echo -e "  ${YELLOW}⚠${NC} Terminal Recording: Skipped (dependencies missing)" | tee -a "$LOG_FILE"
        else
            echo -e "  ${RED}✗${NC} Terminal Recording: Failed to create" | tee -a "$LOG_FILE"
        fi
    fi
fi

echo "" | tee -a "$LOG_FILE"
echo "Log files:" | tee -a "$LOG_FILE"
echo "  - Backend log: ${SESSION_DIR}/backend.log" | tee -a "$LOG_FILE"
echo "  - Frontend log: ${SESSION_DIR}/frontend.log" | tee -a "$LOG_FILE"
echo "  - Summary log: $LOG_FILE" | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
if [ "$RECORD_BROWSER" = false ] && [ "$RECORD_TERMINAL" = false ]; then
    echo -e "${GREEN}Test session completed successfully (no recordings)!${NC}" | tee -a "$LOG_FILE"
else
    echo -e "${GREEN}Recording session completed successfully!${NC}" | tee -a "$LOG_FILE"
fi
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"

# Cleanup is handled by trap
exit $TEST_EXIT_CODE