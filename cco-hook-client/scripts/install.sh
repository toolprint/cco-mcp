#!/bin/bash
set -e

# CCO Hook Client Installation Script
# This script downloads and installs the latest CCO Hook Client binary

# Configuration
REPO="toolprint/cco-mcp"
BINARY_NAME="cco-hook-client"
CONFIGURE_NAME="configure-claude"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
GITHUB_API="https://api.github.com/repos"
GITHUB_RELEASES="https://github.com/${REPO}/releases"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

success() {
    echo -e "${GREEN}✅${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}❌${NC} $1" >&2
}

fatal() {
    error "$1"
    exit 1
}

# Help message
show_help() {
    cat << EOF
CCO Hook Client Installation Script

USAGE:
    curl -fsSL https://get.cco-mcp.com/install.sh | sh
    # or
    bash install.sh [OPTIONS]

OPTIONS:
    -h, --help              Show this help message
    -v, --version VERSION   Install specific version (default: latest)
    -d, --dir DIRECTORY     Installation directory (default: /usr/local/bin)
    --no-configure          Skip Claude Code configuration
    --dry-run               Show what would be done without making changes

EXAMPLES:
    # Install latest version
    bash install.sh

    # Install specific version
    bash install.sh --version v0.1.0

    # Install to custom directory
    bash install.sh --dir ~/.local/bin

REQUIREMENTS:
    - curl or wget
    - Linux, macOS, or Windows (with Git Bash/WSL)
    - Write permission to installation directory

EOF
}

# Parse command line arguments
VERSION=""
NO_CONFIGURE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -d|--dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --no-configure)
            NO_CONFIGURE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            fatal "Unknown option: $1"
            ;;
    esac
done

# Detect platform
detect_platform() {
    local os arch

    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)

    case $os in
        linux*)
            os="linux"
            ;;
        darwin*)
            os="macos"
            ;;
        mingw*|msys*|cygwin*)
            os="windows"
            ;;
        *)
            fatal "Unsupported operating system: $os"
            ;;
    esac

    case $arch in
        x86_64|amd64)
            arch="x86_64"
            ;;
        arm64|aarch64)
            if [[ $os == "macos" ]]; then
                arch="aarch64"
            else
                fatal "ARM64 is only supported on macOS currently"
            fi
            ;;
        *)
            fatal "Unsupported architecture: $arch"
            ;;
    esac

    PLATFORM_SUFFIX="${os}-${arch}"
    if [[ $os == "windows" ]]; then
        BINARY_SUFFIX=".exe"
    else
        BINARY_SUFFIX=""
    fi

    info "Detected platform: $PLATFORM_SUFFIX"
}

# Check if required tools are available
check_requirements() {
    local missing_tools=()

    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        missing_tools+=(curl)
    fi

    if ! command -v tar >/dev/null 2>&1 && ! command -v unzip >/dev/null 2>&1; then
        missing_tools+=(tar)
    fi

    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        fatal "Missing required tools: ${missing_tools[*]}"
    fi
}

# Download file using curl or wget
download_file() {
    local url="$1"
    local output="$2"

    info "Downloading: $url"

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL -o "$output" "$url" || fatal "Download failed"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$output" "$url" || fatal "Download failed"
    else
        fatal "Neither curl nor wget is available"
    fi
}

# Get latest release version from GitHub API
get_latest_version() {
    local api_url="${GITHUB_API}/${REPO}/releases/latest"
    local version

    info "Fetching latest version information..."

    if command -v curl >/dev/null 2>&1; then
        version=$(curl -fsSL "$api_url" | grep '"tag_name":' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
    elif command -v wget >/dev/null 2>&1; then
        version=$(wget -qO- "$api_url" | grep '"tag_name":' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
    else
        fatal "Cannot fetch version information"
    fi

    if [[ -z "$version" ]]; then
        fatal "Could not determine latest version"
    fi

    echo "$version"
}

# Download and install binaries
install_binaries() {
    local version="$1"
    local temp_dir

    temp_dir=$(mktemp -d)
    trap "rm -rf '$temp_dir'" EXIT

    info "Installing CCO Hook Client $version"

    # Download main binary
    local binary_name="${BINARY_NAME}-${PLATFORM_SUFFIX}${BINARY_SUFFIX}"
    local binary_url="${GITHUB_RELEASES}/download/${version}/${binary_name}"
    local binary_temp="$temp_dir/$binary_name"

    download_file "$binary_url" "$binary_temp"

    # Download configure utility
    local configure_name="${CONFIGURE_NAME}-${PLATFORM_SUFFIX}${BINARY_SUFFIX}"
    local configure_url="${GITHUB_RELEASES}/download/${version}/${configure_name}"
    local configure_temp="$temp_dir/$configure_name"

    download_file "$configure_url" "$configure_temp" || warning "Could not download configure utility (not critical)"

    # Verify downloads
    if [[ ! -f "$binary_temp" ]]; then
        fatal "Binary download failed"
    fi

    # Make binaries executable
    chmod +x "$binary_temp"
    [[ -f "$configure_temp" ]] && chmod +x "$configure_temp"

    # Test the binary
    info "Testing binary..."
    if ! "$binary_temp" --version >/dev/null 2>&1; then
        fatal "Downloaded binary is not working correctly"
    fi

    success "Binary test passed"

    # Install binaries
    local target_binary="${INSTALL_DIR}/${BINARY_NAME}${BINARY_SUFFIX}"
    local target_configure="${INSTALL_DIR}/${CONFIGURE_NAME}${BINARY_SUFFIX}"

    if [[ $DRY_RUN == true ]]; then
        info "DRY RUN: Would install:"
        info "  $binary_temp -> $target_binary"
        [[ -f "$configure_temp" ]] && info "  $configure_temp -> $target_configure"
        return
    fi

    # Create install directory if needed
    if [[ ! -d "$INSTALL_DIR" ]]; then
        info "Creating installation directory: $INSTALL_DIR"
        mkdir -p "$INSTALL_DIR" || fatal "Could not create installation directory"
    fi

    # Check write permissions
    if [[ ! -w "$INSTALL_DIR" ]]; then
        warning "No write permission to $INSTALL_DIR, trying with sudo..."
        if ! command -v sudo >/dev/null 2>&1; then
            fatal "sudo not available and no write permission to $INSTALL_DIR"
        fi
        SUDO_PREFIX="sudo"
    else
        SUDO_PREFIX=""
    fi

    # Install main binary
    info "Installing $BINARY_NAME to $target_binary"
    $SUDO_PREFIX cp "$binary_temp" "$target_binary" || fatal "Installation failed"

    # Install configure utility
    if [[ -f "$configure_temp" ]]; then
        info "Installing $CONFIGURE_NAME to $target_configure"
        $SUDO_PREFIX cp "$configure_temp" "$target_configure" || warning "Could not install configure utility"
    fi

    success "Installation completed successfully!"
}

# Verify installation
verify_installation() {
    local binary_path="${INSTALL_DIR}/${BINARY_NAME}${BINARY_SUFFIX}"

    if [[ ! -f "$binary_path" ]]; then
        fatal "Installation verification failed: binary not found at $binary_path"
    fi

    if ! "$binary_path" --version >/dev/null 2>&1; then
        fatal "Installation verification failed: binary is not executable"
    fi

    local version_output
    version_output=$("$binary_path" --version 2>/dev/null | head -1)

    success "Installation verified: $version_output"
}

# Configure Claude Code
configure_claude() {
    if [[ $NO_CONFIGURE == true ]] || [[ $DRY_RUN == true ]]; then
        return
    fi

    local configure_path="${INSTALL_DIR}/${CONFIGURE_NAME}${BINARY_SUFFIX}"

    if [[ ! -f "$configure_path" ]]; then
        warning "Configure utility not available, skipping Claude Code configuration"
        return
    fi

    info "Configuring Claude Code..."

    if "$configure_path" --dry-run >/dev/null 2>&1; then
        read -p "Configure Claude Code now? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            "$configure_path" || warning "Claude Code configuration failed (not critical)"
        else
            info "Skipped Claude Code configuration"
            info "Run '$configure_path' later to configure Claude Code"
        fi
    else
        warning "Claude Code configuration not available"
    fi
}

# Show post-installation instructions
show_post_install() {
    local binary_path="${INSTALL_DIR}/${BINARY_NAME}${BINARY_SUFFIX}"
    local configure_path="${INSTALL_DIR}/${CONFIGURE_NAME}${BINARY_SUFFIX}"

    cat << EOF

🎉 CCO Hook Client installation completed!

📁 Installed Files:
   Binary: $binary_path
$([ -f "$configure_path" ] && echo "   Configure: $configure_path")

🚀 Next Steps:
   1. Verify installation: $BINARY_NAME --version
   2. Configure Claude Code: $CONFIGURE_NAME
   3. Start CCO-MCP server: cd cco-mcp && pnpm dev
   4. Run Claude Code with hook monitoring enabled

📚 Documentation:
   GitHub: https://github.com/${REPO}
   Issues: https://github.com/${REPO}/issues

🔧 Troubleshooting:
   - Test server connection: $BINARY_NAME --health-check
   - Validate config: $BINARY_NAME validate
   - View help: $BINARY_NAME --help

EOF
}

# Main installation flow
main() {
    info "CCO Hook Client Installation Script"

    detect_platform
    check_requirements

    # Determine version to install
    if [[ -z "$VERSION" ]]; then
        VERSION=$(get_latest_version)
    fi

    info "Installing version: $VERSION"

    install_binaries "$VERSION"

    if [[ $DRY_RUN == true ]]; then
        info "DRY RUN completed - no files were modified"
        exit 0
    fi

    verify_installation
    configure_claude
    show_post_install

    success "Installation completed successfully! 🎉"
}

# Run main function
main "$@"