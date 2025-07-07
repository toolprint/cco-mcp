#!/bin/bash

# E2E Test Script for CCO-MCP
# This script tests the cco-mcp approval system using claude-task

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CCO_PORT=${CCO_PORT:-8660}
TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMP_REPOS_DIR="${TEST_DIR}/temp-repos"

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

# Function to generate fun repo names
generate_repo_name() {
    local prefixes=("zap" "bop" "hip" "pop" "zip" "tap" "hop" "dip" "pip" "tip")
    local prefix=${prefixes[$RANDOM % ${#prefixes[@]}]}
    local suffix=$((RANDOM % 1000))
    echo "${prefix}-${suffix}"
}

# Function to check Docker is available
check_docker() {
    if ! docker version >/dev/null 2>&1; then
        print_error "Docker is not accessible. Please ensure Docker Desktop is running."
        print_info "You can start Docker Desktop from Applications or the macOS menu bar."
        exit 1
    fi
}

# Function to check if cco-mcp is running
check_cco_running() {
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${CCO_PORT}/health" | grep -q "200"; then
        return 0
    else
        return 1
    fi
}

# Function to create test repository
create_test_repo() {
    local repo_name=$1
    local repo_path="${TEMP_REPOS_DIR}/${repo_name}"
    
    print_info "Creating test repository: ${repo_name}"
    print_info "Repository path will be: ${repo_path}"
    
    mkdir -p "${repo_path}"
    
    if [ ! -d "${repo_path}" ]; then
        print_error "Failed to create directory: ${repo_path}"
        return 1
    fi
    
    # Work in a subshell to avoid changing the parent's directory
    (
        cd "${repo_path}" || {
            print_error "Failed to cd to ${repo_path}"
            exit 1
        }
    
    # Initialize git repo with main branch
    git init --initial-branch=main >&2
    git config user.email "test@example.com" >&2
    git config user.name "Test User" >&2
    
    # Create MCP configuration
    cat > .mcp.ct.json <<EOF
{
  "mcpServers": {
    "cco": {
      "type": "http",
      "url": "http://host.docker.internal:${CCO_PORT}/mcp"
    },
    "context7": {
      "type": "sse",
      "url": "https://mcp.context7.com/sse"
    }
  }
}
EOF
    
        # Create initial commit
        git add .mcp.ct.json >&2
        git commit -m "Initial commit with MCP config" >&2
    )
    
    if [ $? -eq 0 ]; then
        print_success "Test repository created at: ${repo_path}"
        # Return absolute path
        echo "$(cd "${repo_path}" && pwd)"
    else
        print_error "Failed to initialize repository"
        return 1
    fi
}

# Function to run a test scenario
run_test_scenario() {
    local scenario_name=$1
    local prompt=$2
    local repo_name=$(generate_repo_name)
    local task_id="${repo_name:0:9}" # Use first 9 chars as task ID
    
    print_info "Running test scenario: ${scenario_name}"
    print_info "Repository: ${repo_name}"
    print_info "Task ID: ${task_id}"
    
    # Save current directory
    local original_dir=$(pwd)
    
    # Create test repository
    local repo_path=$(create_test_repo "${repo_name}")
    
    # Debug logging
    print_info "Returned repo_path: '${repo_path}'"
    
    # The repo_path is already absolute from create_test_repo function
    
    if [ -z "${repo_path}" ]; then
        print_error "Repository path is empty"
        return 1
    fi
    
    if [ ! -d "${repo_path}" ]; then
        print_error "Repository path does not exist: ${repo_path}"
        return 1
    fi
    
    print_info "Repository absolute path: ${repo_path}"
    
    # Run claude-task from the test repository directory
    print_info "Executing claude-task with prompt: ${prompt}"
    print_info "Working directory: ${repo_path}"
    
    # Change to repo directory and run claude-task
    (
        cd "${repo_path}" || {
            print_error "Failed to change to repository directory: ${repo_path}"
            return 1
        }
        
        print_info "Current directory: $(pwd)"
        print_info "Files in directory: $(ls -la)"
        
        ct run \
            --task-id "${task_id}" \
            --workspace-dir "${repo_path}" \
            --mcp-config .mcp.ct.json \
            --approval-tool-permission "mcp__cco__approval_prompt" \
            --yes \
            "${prompt}"
    )
    
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        print_success "Test scenario '${scenario_name}' completed successfully"
    else
        print_error "Test scenario '${scenario_name}' failed with exit code: ${exit_code}"
        
        # Check if it's an authentication error
        if grep -q "authentication_error\|OAuth token has expired" "${TEMP_REPOS_DIR}/${repo_name}/ct.log" 2>/dev/null || \
           grep -q "authentication_error\|OAuth token has expired" /tmp/ct-${task_id}.log 2>/dev/null; then
            print_error "Authentication error detected. Please run 'ct setup' to configure your API keys."
        fi
    fi
    
    return $exit_code
}

# Function to cleanup test repositories
cleanup_repos() {
    if [ -d "${TEMP_REPOS_DIR}" ]; then
        print_info "Cleaning up test repositories..."
        rm -rf "${TEMP_REPOS_DIR}"
        print_success "Cleanup completed"
    fi
}

# Main test execution
main() {
    print_info "Starting CCO-MCP E2E Tests"
    
    # Check if claude-task is available
    if ! ct -h &>/dev/null; then
        print_error "claude-task (ct) is not available"
        print_info "Please install claude-task globally or ensure it's in your PATH"
        exit 1
    fi
    
    print_success "claude-task is available"
    
    # Check if cco-mcp is running
    if ! check_cco_running; then
        print_error "CCO-MCP server is not running on port ${CCO_PORT}"
        print_info "Please start the server with: pnpm dev or pnpm prod"
        exit 1
    fi
    
    print_success "CCO-MCP server is running on port ${CCO_PORT}"
    
    # Create temp repos directory
    mkdir -p "${TEMP_REPOS_DIR}"
    
    # Test scenarios
    local test_passed=0
    local test_failed=0
    
    # Test 1: Basic file operations
    if run_test_scenario "Basic File Operations" \
        "Create a file called hello.py with a simple print statement, then use bash to run it with python"; then
        ((test_passed++))
    else
        ((test_failed++))
    fi
    
    # Test 2: File editing operations
    if run_test_scenario "File Editing Operations" \
        "Create a simple JavaScript file called app.js with a console.log statement, then edit it to add another line"; then
        ((test_passed++))
    else
        ((test_failed++))
    fi
    
    # Test 3: Context7 documentation lookup
    if run_test_scenario "Documentation Lookup" \
        "Use context7 to look up documentation for the Python requests library"; then
        ((test_passed++))
    else
        ((test_failed++))
    fi
    
    # Test 4: Combined operations
    if run_test_scenario "Combined Operations" \
        "Create a README.md file with project information, then create a simple index.html file that references it"; then
        ((test_passed++))
    else
        ((test_failed++))
    fi
    
    # Print test summary
    echo ""
    print_info "Test Summary:"
    print_success "Passed: ${test_passed}"
    if [ $test_failed -gt 0 ]; then
        print_error "Failed: ${test_failed}"
    fi
    
    # Cleanup (optional - comment out to keep test repos for inspection)
    # cleanup_repos
    
    # Exit with appropriate code
    if [ $test_failed -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# Handle script arguments
case "${1:-}" in
    clean)
        cleanup_repos
        ;;
    *)
        main
        ;;
esac