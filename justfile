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