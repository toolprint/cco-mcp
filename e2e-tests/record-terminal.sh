#!/bin/bash

# Terminal Recording Helper Script for CCO-MCP E2E Tests
# This script uses the 'script' command to create a pseudo-terminal (PTY) environment
# that allows Terminalizer to function properly in non-interactive contexts.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[TERMINAL RECORDER]${NC} $1" >&2
}

print_success() {
    echo -e "${GREEN}[TERMINAL RECORDER]${NC} $1" >&2
}

print_error() {
    echo -e "${RED}[TERMINAL RECORDER]${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}[TERMINAL RECORDER]${NC} $1" >&2
}

# Check arguments
if [ $# -lt 2 ]; then
    print_error "Usage: $0 <output-file> <command-or-script> [config-file]"
    print_info "Example: $0 recording.yml './run-test.sh' terminalizer.yml"
    exit 1
fi

OUTPUT_FILE="$1"
COMMAND="$2"
CONFIG_FILE="${3:-}"

# Check if script command is available
if ! command -v script >/dev/null 2>&1; then
    print_error "The 'script' command is not available on this system"
    print_info "Terminal recording requires the 'script' command for PTY emulation"
    exit 1
fi

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if terminalizer is available
if ! (cd "$PROJECT_ROOT" && pnpm exec terminalizer --version >/dev/null 2>&1); then
    print_error "Terminalizer is not available"
    print_info "Please run 'pnpm install' to install dependencies"
    exit 1
fi

# Get absolute paths
OUTPUT_FILE="$(cd "$(dirname "$OUTPUT_FILE")" && pwd)/$(basename "$OUTPUT_FILE")"

# If config file is provided, get its absolute path
if [ -n "$CONFIG_FILE" ]; then
    if [ -f "$CONFIG_FILE" ]; then
        CONFIG_FILE="$(cd "$(dirname "$CONFIG_FILE")" && pwd)/$(basename "$CONFIG_FILE")"
    else
        print_warning "Config file not found: $CONFIG_FILE"
        CONFIG_FILE=""
    fi
fi

# Create a temporary script that will be executed
TEMP_SCRIPT="/tmp/terminalizer-exec-$$.sh"
cat > "$TEMP_SCRIPT" << EOF
#!/bin/bash
# Clear the screen first to start fresh
clear
# Execute the command
$COMMAND
# Add a clear exit message
echo ""
echo "Recording completed."
# Small delay before exit
sleep 0.5
exit 0
EOF
chmod +x "$TEMP_SCRIPT"

# Build terminalizer command to record the script execution
TERMINALIZER_CMD="cd \"$PROJECT_ROOT\" && pnpm exec terminalizer record"
TERMINALIZER_CMD="$TERMINALIZER_CMD \"$OUTPUT_FILE\""
TERMINALIZER_CMD="$TERMINALIZER_CMD --command \"bash $TEMP_SCRIPT\""
TERMINALIZER_CMD="$TERMINALIZER_CMD --skip-sharing"

if [ -n "$CONFIG_FILE" ]; then
    TERMINALIZER_CMD="$TERMINALIZER_CMD --config \"$CONFIG_FILE\""
fi

print_info "Starting terminal recording..."
print_info "Output file: $OUTPUT_FILE"
print_info "Command: $COMMAND"
if [ -n "$CONFIG_FILE" ]; then
    print_info "Config: $CONFIG_FILE"
    # Show recording mode info based on config file
    case "$(basename "$CONFIG_FILE")" in
        "terminalizer-quick.yml")
            print_info "Mode: Quick demo (Quality: 60, Frame rate: ~10fps, Size: 120x30)"
            ;;
        "terminalizer-production.yml")
            print_info "Mode: Production demo (Quality: 90, Frame rate: ~20fps, Size: 140x35)"
            ;;
        "terminalizer-record.yml")
            print_info "Mode: Default (Quality: 100, Frame rate: auto, Size: 120x30)"
            ;;
        *)
            print_info "Mode: Custom configuration"
            ;;
    esac
fi

# Set terminal dimensions based on recording mode
case "$(basename "$CONFIG_FILE")" in
    "terminalizer-quick.yml")
        export COLUMNS=120
        export LINES=30
        ;;
    "terminalizer-production.yml")
        export COLUMNS=140
        export LINES=35
        ;;
    *)
        export COLUMNS=120
        export LINES=30
        ;;
esac

# Use script to create a PTY environment for terminalizer
# -q: quiet mode (no script start/stop messages) 
# -F: flush output after each write (macOS specific)
# /dev/null: don't save script's own output
# The actual command output is captured by terminalizer
# Note: We set COLUMNS and LINES to ensure proper terminal dimensions
if script -q -F /dev/null env COLUMNS=$COLUMNS LINES=$LINES bash -c "$TERMINALIZER_CMD" 2>/dev/null; then
    # Clean up temp script
    rm -f "$TEMP_SCRIPT"
    
    print_success "Terminal recording completed successfully"
    print_info "Recording saved to: $OUTPUT_FILE"
    
    # Check if the recording file was created
    if [ -f "$OUTPUT_FILE" ]; then
        FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
        print_success "Recording file size: $FILE_SIZE"
        exit 0
    else
        print_error "Recording file was not created"
        exit 1
    fi
else
    # Clean up temp script
    rm -f "$TEMP_SCRIPT"
    print_error "Terminal recording failed"
    exit 1
fi