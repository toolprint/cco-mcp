#!/bin/bash

# Convert Terminal Recording Script for CCO-MCP E2E Tests
# This script converts GIF recordings to various video formats for smaller file sizes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[CONVERTER]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[CONVERTER]${NC} $1"
}

print_error() {
    echo -e "${RED}[CONVERTER]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[CONVERTER]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 <input-gif> <output-format> [output-file]"
    echo ""
    echo "Formats:"
    echo "  webm     Convert to WebM (VP9 codec, excellent compression)"
    echo "  webp     Convert to WebP (animated, good browser support)"
    echo "  mp4      Convert to MP4 (H.264 codec, universal compatibility)"
    echo ""
    echo "Examples:"
    echo "  $0 recording.gif webm                    # Creates recording.webm"
    echo "  $0 recording.gif webp custom-name.webp   # Creates custom-name.webp"
    echo "  $0 recording.gif mp4 demo.mp4           # Creates demo.mp4"
    exit 0
}

# Check if ffmpeg is installed
check_ffmpeg() {
    if ! command -v ffmpeg >/dev/null 2>&1; then
        print_error "FFmpeg is not installed or not in PATH"
        print_info "Install FFmpeg on macOS with: brew install ffmpeg"
        print_info "For other systems, visit: https://ffmpeg.org/download.html"
        return 1
    fi
    return 0
}

# Get file size in human readable format
get_file_size() {
    if [ -f "$1" ]; then
        du -h "$1" | cut -f1
    else
        echo "N/A"
    fi
}

# Convert to WebM
convert_to_webm() {
    local input="$1"
    local output="$2"
    
    print_info "Converting to WebM format..."
    print_info "Using VP9 codec with CRF 23 for optimal quality/size balance"
    
    # VP9 codec with CRF 23 (good quality, smaller size than CRF 18)
    # -b:v 0 enables constant quality mode
    # -deadline good balances speed and compression
    if ffmpeg -i "$input" \
        -c:v libvpx-vp9 \
        -crf 23 \
        -b:v 0 \
        -deadline good \
        -cpu-used 2 \
        -row-mt 1 \
        -an \
        -y \
        "$output" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Convert to WebP
convert_to_webp() {
    local input="$1"
    local output="$2"
    
    print_info "Converting to WebP format..."
    print_info "Using animated WebP with quality optimization"
    
    # Animated WebP with good compression
    # -loop 0 for infinite loop
    # -preset default for balanced speed/compression
    # -quality 75 for good visual quality with smaller size
    if ffmpeg -i "$input" \
        -vcodec libwebp \
        -filter:v fps=fps=10 \
        -lossless 0 \
        -compression_level 6 \
        -quality 75 \
        -loop 0 \
        -preset default \
        -an \
        -vsync 0 \
        -y \
        "$output" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Convert to MP4
convert_to_mp4() {
    local input="$1"
    local output="$2"
    
    print_info "Converting to MP4 format..."
    print_info "Using H.264 codec for maximum compatibility"
    
    # H.264 with CRF 23 for good quality and universal compatibility
    # -pix_fmt yuv420p ensures compatibility with most players
    if ffmpeg -i "$input" \
        -c:v libx264 \
        -crf 23 \
        -pix_fmt yuv420p \
        -movflags +faststart \
        -an \
        -y \
        "$output" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Main script logic
main() {
    # Check arguments
    if [ $# -lt 2 ]; then
        print_error "Insufficient arguments"
        show_usage
    fi

    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_usage
    fi

    local input_file="$1"
    local format="$2"
    local output_file="$3"

    # Check if input file exists
    if [ ! -f "$input_file" ]; then
        print_error "Input file not found: $input_file"
        exit 1
    fi

    # Check if ffmpeg is available
    if ! check_ffmpeg; then
        exit 1
    fi

    # Generate output filename if not provided
    if [ -z "$output_file" ]; then
        local basename=$(basename "$input_file" .gif)
        local dirname=$(dirname "$input_file")
        case "$format" in
            webm)
                output_file="${dirname}/${basename}.webm"
                ;;
            webp)
                output_file="${dirname}/${basename}.webp"
                ;;
            mp4)
                output_file="${dirname}/${basename}.mp4"
                ;;
            *)
                print_error "Unsupported format: $format"
                print_info "Supported formats: webm, webp, mp4"
                exit 1
                ;;
        esac
    fi

    # Get input file size
    input_size=$(get_file_size "$input_file")
    
    print_info "Starting conversion..."
    print_info "Input:  $input_file ($input_size)"
    print_info "Output: $output_file"
    print_info "Format: $format"
    echo ""

    # Perform conversion based on format
    case "$format" in
        webm)
            if convert_to_webm "$input_file" "$output_file"; then
                print_success "WebM conversion completed successfully"
            else
                print_error "WebM conversion failed"
                exit 1
            fi
            ;;
        webp)
            if convert_to_webp "$input_file" "$output_file"; then
                print_success "WebP conversion completed successfully"
            else
                print_error "WebP conversion failed"
                exit 1
            fi
            ;;
        mp4)
            if convert_to_mp4 "$input_file" "$output_file"; then
                print_success "MP4 conversion completed successfully"
            else
                print_error "MP4 conversion failed"
                exit 1
            fi
            ;;
        *)
            print_error "Unsupported format: $format"
            exit 1
            ;;
    esac

    # Show file size comparison
    if [ -f "$output_file" ]; then
        output_size=$(get_file_size "$output_file")
        print_success "Conversion completed!"
        echo ""
        print_info "File size comparison:"
        print_info "  Original (GIF): $input_size"
        print_info "  Converted ($format): $output_size"
        echo ""
        print_info "Output saved to: $output_file"
    else
        print_error "Output file was not created"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"