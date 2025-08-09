#!/usr/bin/env -S just --justfile

# Recommend installing completion scripts: https://just.systems/man/en/shell-completion-scripts.html
# Recommend installing vscode extension: https://just.systems/man/en/visual-studio-code.html

# Common commands
doppler_run := "doppler run --"
doppler_run_preserve := "doppler run --preserve-env --"

# Default recipe - show available commands
_default:
    @just -l -u

# Brew installation
[group('setup')]
brew:
    brew update & brew bundle install --file=./Brewfile

[group('setup')]
doppler-install:
    brew install gnupg
    brew install dopplerhq/cli/doppler

# Recursively sync git submodules
[group('git')]
sync-submodules:
    git submodule update --init --recursive

# Show git status
[group('git')]
git-status:
    git status

# Create a new git branch
[group('git')]
git-branch name:
    git checkout -b {{ name }}

# ====== Core CCO-MCP Commands ======

# Build the project
build:
    pnpm build

# Build and watch for changes
build-watch:
    pnpm build:watch

# Build UI
build-ui:
    pnpm build:ui

# Build everything (core + UI)
build-all:
    pnpm build:all

# Start production server
start:
    pnpm start

# Run production build
prod:
    pnpm prod

# ====== Development Commands ======

# Run development server
dev:
    pnpm dev

# Run development server with auto-approve
dev-auto:
    pnpm dev:auto-approve

# Run UI development server
dev-ui:
    pnpm dev:ui

# Run both backend and UI in development
dev-all:
    pnpm dev:all

# Inspect MCP server
inspect:
    pnpm inspect

# ====== Code Quality ======

# Format code
format:
    pnpm format

# Check formatting
format-check:
    pnpm format:check

# Run linter
lint:
    pnpm lint

# Run tests
test:
    pnpm test

# ====== E2E Testing ======

# Run E2E test without recording
e2e-test:
    cd e2e-tests && ./run-test.sh

# Run E2E test with browser recording only
e2e-test-browser:
    cd e2e-tests && ./run-test-with-recording.sh -b

# Run E2E test with terminal recording only
e2e-test-terminal:
    cd e2e-tests && ./run-test-with-recording.sh -t

# Run E2E test with both browser and terminal recording
e2e-test-full:
    cd e2e-tests && ./run-test-with-recording.sh -b -t

# ====== Docker Commands ======

# Build Docker image
docker-build:
    pnpm docker:build

# Build Docker development image
docker-build-dev:
    pnpm docker:build:dev

# Push Docker image to registry
docker-push:
    pnpm docker:push

# ====== Docker Compose Commands ======

# Start services in detached mode
compose-up:
    docker compose up -d

# Stop and remove services
compose-down:
    docker compose down

# View logs (follow mode)
compose-logs:
    docker compose logs -f

# ====== Utility Commands ======

# Install Playwright
playwright-install:
    pnpm playwright:install

# ====== Combined Commands ======

# Full build and test
ci:
    just build-all
    just lint
    just test

# Setup development environment
setup:
    pnpm install
    cd ui && pnpm install
    just playwright-install

# Clean everything
clean:
    rm -rf dist
    rm -rf ui/dist
    rm -rf e2e-tests/recordings

# ====== Hook Client Commands ======

# Build Rust hook client
hook-build:
    cd cco-hook-client && cargo build --release

# Install hook client (build + configure)
hook-install:
    just hook-build
    ./cco-hook-client/target/release/configure-claude --binary-path $(pwd)/cco-hook-client/target/release/cco-hook-client --backup

# Check hook installation status
hook-status:
    ./cco-hook-client/target/release/cco-hook-client status

# Check detailed hook installation status
hook-status-detailed:
    ./cco-hook-client/target/release/cco-hook-client status --detailed

# Uninstall hooks from Claude Code
hook-uninstall:
    ./cco-hook-client/target/release/configure-claude --uninstall

# Uninstall hooks without confirmation
hook-uninstall-force:
    ./cco-hook-client/target/release/configure-claude --uninstall --yes

# Health check for hook client and server
hook-health:
    ./cco-hook-client/target/release/cco-hook-client --health-check

# Update hook configuration (re-run configure)
hook-update:
    ./cco-hook-client/target/release/configure-claude --binary-path $(pwd)/cco-hook-client/target/release/cco-hook-client --force --backup

# Build and test hook client
hook-test:
    cd cco-hook-client && cargo test
    just hook-build
    echo '{"type":"PreToolUse","session_id":"test","timestamp":"2024-01-01T12:00:00Z","tool":{"name":"Read","input":{"file_path":"test.txt"}}}' | ./cco-hook-client/target/release/cco-hook-client --dry-run

# Generate default hook client config
hook-config:
    ./cco-hook-client/target/release/cco-hook-client config --output cco-hook-client.toml

# Validate hook client configuration
hook-validate:
    ./cco-hook-client/target/release/cco-hook-client validate

# Show hook client version information
hook-version:
    ./cco-hook-client/target/release/cco-hook-client version

# View recent hook client log entries
hook-logs:
    @if [ -f ~/.cco-hook-client/hooks.log ]; then tail -50 ~/.cco-hook-client/hooks.log; else echo "No log file found at ~/.cco-hook-client/hooks.log"; fi

# Follow hook client logs in real-time
hook-logs-follow:
    @if [ -f ~/.cco-hook-client/hooks.log ]; then tail -f ~/.cco-hook-client/hooks.log; else echo "No log file found. Creating and monitoring..."; touch ~/.cco-hook-client/hooks.log && tail -f ~/.cco-hook-client/hooks.log; fi

# Clear hook client logs
hook-logs-clear:
    @if [ -f ~/.cco-hook-client/hooks.log ]; then > ~/.cco-hook-client/hooks.log && echo "Hook client logs cleared"; else echo "No log file found at ~/.cco-hook-client/hooks.log"; fi

# Show hook client log file info
hook-logs-info:
    @echo "Hook Client Log Information:"
    @echo "  Config: ~/.cco-hook-client/config.toml"
    @if [ -f ~/.cco-hook-client/hooks.log ]; then echo "  Log file: ~/.cco-hook-client/hooks.log"; ls -lh ~/.cco-hook-client/hooks.log; else echo "  Log file: Not created yet"; fi

# Clean hook client build artifacts
hook-clean:
    cd cco-hook-client && cargo clean

# Full hook client development cycle (clean, build, test, status)
hook-dev:
    just hook-clean
    just hook-build
    just hook-test
    just hook-status-detailed

# ====== Quick Commands ======

# Quick start for development
quick-start:
    just dev-all

# Quick demo recording (browser only)
quick-demo:
    just e2e-test-browser

# Quick test
quick-test:
    just lint
    just test