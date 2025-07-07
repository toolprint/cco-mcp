#!/bin/bash

# Render Terminal Recording Script for CCO-MCP E2E Tests
# This script handles rendering terminalizer YML files to GIF and optional format conversion

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[RENDERER]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[RENDERER]${NC} $1"
}

print_error() {
    echo -e "${RED}[RENDERER]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[RENDERER]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 <yml-file> [options]"
    echo ""
    echo "Options:"
    echo "  --format <format>    Output format: gif (default), webm, webp, mp4"
    echo "  --output <file>      Custom output file path"
    echo "  --mode <mode>        Recording mode: quick (default), production"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 recording.yml                           # Render to GIF"
    echo "  $0 recording.yml --format webm             # Render to GIF then convert to WebM"
    echo "  $0 recording.yml --format webp --mode production  # Production mode WebP"
    echo ""
    exit 0
}

# Default values
OUTPUT_FORMAT="gif"
RECORDING_MODE="quick"
CUSTOM_OUTPUT=""

# Parse arguments
if [ $# -lt 1 ]; then
    print_error "No input file provided"
    show_usage
fi

YML_FILE="$1"
shift

# Parse remaining arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --format)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        --output)
            CUSTOM_OUTPUT="$2"
            shift 2
            ;;
        --mode)
            RECORDING_MODE="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            ;;
    esac
done

# Validate input file
if [ ! -f "$YML_FILE" ]; then
    print_error "Input file not found: $YML_FILE"
    exit 1
fi

# Convert to absolute path
YML_FILE="$(cd "$(dirname "$YML_FILE")" && pwd)/$(basename "$YML_FILE")"

# Get script directory and paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
YML_BASENAME=$(basename "$YML_FILE" .yml)
YML_DIRNAME=$(dirname "$YML_FILE")

# Determine output paths
if [ -n "$CUSTOM_OUTPUT" ]; then
    FINAL_OUTPUT="$CUSTOM_OUTPUT"
    GIF_FILE="${YML_DIRNAME}/${YML_BASENAME}.gif"
else
    GIF_FILE="${YML_DIRNAME}/${YML_BASENAME}.gif"
    if [ "$OUTPUT_FORMAT" = "gif" ]; then
        FINAL_OUTPUT="$GIF_FILE"
    else
        FINAL_OUTPUT="${YML_DIRNAME}/${YML_BASENAME}.${OUTPUT_FORMAT}"
    fi
fi

print_info "Starting terminal recording render process..."
print_info "Input: $YML_FILE"
print_info "Mode: $RECORDING_MODE"
print_info "Format: $OUTPUT_FORMAT"
print_info "Output: $FINAL_OUTPUT"
echo ""

# Step 1: Render YML to GIF using terminalizer
print_info "Rendering terminal recording to GIF..."
cd "$SCRIPT_DIR/.."

# Show the exact command being run
print_info "Running command: pnpm exec terminalizer render \"$YML_FILE\" -o \"$GIF_FILE\""

# Temporarily enable command tracing for debugging
set -x
if pnpm exec terminalizer render "$YML_FILE" -o "$GIF_FILE"; then
    set +x
    print_success "GIF rendering completed successfully"
    
    # Check GIF size
    if [ -f "$GIF_FILE" ]; then
        GIF_SIZE=$(du -h "$GIF_FILE" | cut -f1)
        print_info "GIF size: $GIF_SIZE"
    fi
else
    set +x
    print_error "Failed to render GIF from YML file"
    exit 1
fi

# Step 2: Convert to other format if requested
if [ "$OUTPUT_FORMAT" != "gif" ] && [ -f "$GIF_FILE" ]; then
    # Only convert for production mode or if explicitly requested
    if [ "$RECORDING_MODE" = "production" ] || [ -n "$CUSTOM_OUTPUT" ]; then
        print_info "Converting GIF to ${OUTPUT_FORMAT}..."
        cd "$SCRIPT_DIR"
        
        # Use the conversion script
        if ./convert-recording.sh "$GIF_FILE" "$OUTPUT_FORMAT" "$FINAL_OUTPUT"; then
            print_success "Conversion to ${OUTPUT_FORMAT} completed successfully"
            
            # Show final output info
            if [ -f "$FINAL_OUTPUT" ]; then
                FINAL_SIZE=$(du -h "$FINAL_OUTPUT" | cut -f1)
                print_info "Final output: $FINAL_OUTPUT ($FINAL_SIZE)"
            fi
        else
            print_error "Conversion to ${OUTPUT_FORMAT} failed"
            FINAL_OUTPUT="$GIF_FILE"
            print_warning "Keeping original GIF: $FINAL_OUTPUT"
        fi
    else
        print_warning "Format conversion is only available in production mode"
        print_info "Use --mode production to enable format conversion"
        FINAL_OUTPUT="$GIF_FILE"
    fi
fi

# Summary
echo ""
print_success "Rendering process completed!"
print_info "Final output: $FINAL_OUTPUT"

# Return the final output path for use in calling scripts
echo "$FINAL_OUTPUT"