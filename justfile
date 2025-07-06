# CCO-MCP Justfile
# Shortcuts for building, testing, and running CCO-MCP

# Default recipe to display help
default:
    @just --list

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