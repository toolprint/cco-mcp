# CCO-MCP End-to-End Tests

This directory contains end-to-end tests for the CCO-MCP (Claude Code Operator MCP) approval system using claude-task.

## 🚀 New: Modular Test System

A new modular E2E test recording system is available in the `modular/` directory. This system provides:

- Better separation of concerns with 4 distinct modules
- Precise recording timing control (records only `ct run` output)
- Clean recordings without setup/teardown noise
- Modular, maintainable Node.js codebase
- Easy addition of new test scenarios

See [modular/README.md](modular/README.md) for details.

## Legacy Bash-Based System

The original bash-based test system is documented below and remains functional.

## Prerequisites

1. **CCO-MCP Server Running**: The CCO-MCP server must be running on port 8660:

   ```bash
   # From the parent directory
   pnpm dev  # For development
   # or
   pnpm prod # For production
   ```

2. **Claude-Task Installed**: Ensure `ct` (claude-task) is available:

   ```bash
   npx -y claude-task --version
   ```

3. **Docker Running**: Tests run in Docker containers and need Docker daemon running

4. **API Keys**: Ensure you have the necessary API keys set in your environment:

   - `ANTHROPIC_API_KEY` - Required for Claude
   - Other MCP server keys as needed

5. **Recording Dependencies** (for recording tests):

   - **Playwright**: Installed as dev dependency (`pnpm install`)
   - **Terminalizer**: Installed as dev dependency (`pnpm install`)
   - **Chromium**: Run `pnpm playwright:install` to install browser
   - **UI Dependencies**: Run `pnpm install` in the `ui` directory

   **Quick Setup**: Run `./setup-recording.sh` to install all dependencies at once

## Running Tests

### Run All Tests

```bash
./run-test.sh
```

### Run Tests with Recording

```bash
# From parent directory
pnpm test:e2e:record

# Or directly from e2e-tests directory
./run-test-with-recording.sh
```

This will:

- Start backend and frontend services
- Begin recording both UI (Playwright) and terminal (Terminalizer)
- Execute all e2e tests
- Stop recordings and save artifacts
- Generate a terminal GIF for easy sharing

### Clean Up Test Repositories

```bash
./run-test.sh clean
```

## Test Structure

Each test creates a temporary git repository with a unique name (e.g., `zap-123`, `bop-456`) containing:

- `.mcp.ct.json` - MCP server configuration
- Test files created during the test run
- Git history from test operations

## Test Scenarios

1. **Basic File Operations**: Tests file creation and execution with approval
2. **Git Operations**: Tests git MCP server usage requiring approval
3. **Documentation Lookup**: Tests context7 integration with approval
4. **Combined Operations**: Tests multiple tool usage in sequence

## Configuration

The test script uses these environment variables:

- `CCO_PORT` - Port where CCO-MCP is running (default: 8660)
- `CCO_ENDPOINT` - Full endpoint URL for CCO-MCP (default: `http://host.docker.internal:${CCO_PORT}/mcp`)

### Configuration Examples

```bash
# Default (local development)
./run-test.sh

# Custom local port
CCO_PORT=8080 ./run-test.sh

# External endpoint (e.g., Cloud Run deployment)
CCO_ENDPOINT=https://auth-server-cco-mcp-2aylmcmupq-uw.a.run.app/mcp ./run-test.sh

# Any custom endpoint
CCO_ENDPOINT=https://my-cco-server.example.com/mcp ./run-test.sh
```

## MCP Server Configuration

Each test repo is configured with:

- **cco**: HTTP server at the configured `CCO_ENDPOINT` for approvals
- **context7**: SSE server for documentation lookups

The CCO endpoint defaults to `http://host.docker.internal:8660/mcp` for local development but can be overridden to test against external deployments.

## Debugging

- Tests run with `--debug` flag for verbose output
- Check `temp-repos/` directory for test artifacts (if cleanup is disabled)
- View CCO-MCP logs for approval requests and responses

## Test Prompts

See `test-prompts.txt` for the full list of prompts used in testing. You can add new prompts to test additional scenarios.

## Architecture

```text
e2e-tests/
├── README.md                # This file
├── run-test.sh             # Main test runner script
├── run-test-with-recording.sh  # Test runner with recording enabled
├── setup-recording.sh      # One-time setup script for dependencies
├── record-ui.js            # Playwright UI recording script
├── record-terminal.sh      # Terminal recording helper with PTY support
├── terminalizer.yml        # Terminalizer configuration (full)
├── terminalizer-minimal.yml # Minimal terminalizer configuration
├── test-prompts.txt        # Collection of test prompts
├── test-docker.sh          # Docker connectivity test script
├── recordings/             # Recording artifacts (gitignored)
│   ├── ui-TIMESTAMP.webm   # UI video recording
│   ├── terminal-TIMESTAMP.yml  # Terminal recording data
│   ├── terminal-TIMESTAMP.gif  # Rendered terminal GIF
│   ├── backend-TIMESTAMP.log   # Backend service logs
│   ├── frontend-TIMESTAMP.log  # Frontend service logs
│   └── test-run-TIMESTAMP.log  # Test execution summary
└── temp-repos/             # Temporary test repositories (created at runtime)
    ├── zap-123/            # Example test repo
    ├── bop-456/            # Another test repo
    └── ...
```

## Recording System

The recording system captures both UI interactions and terminal output during e2e test runs. This provides visual debugging capabilities and helps create documentation/demos.

### UI Recording (Playwright)

- Records browser at 1280x720 resolution
- Captures the CCO-MCP dashboard interactions
- Saves as WebM video format
- Headless mode for CI/CD compatibility

### Terminal Recording (Terminalizer)

- Records terminal session with test execution
- Custom theme with transparent background
- 120x30 terminal dimensions
- Renders to high-quality GIF format
- Uses Unix `script` command to create pseudo-terminal (PTY) environment
- Automatically skips sharing prompts for unattended operation

### Recording Outputs

All recordings are saved to `recordings/` directory with timestamps:

- **UI Video**: `ui-YYYYMMDD-HHMMSS.webm`
- **Terminal Recording**: `terminal-YYYYMMDD-HHMMSS.yml`
- **Terminal GIF**: `terminal-YYYYMMDD-HHMMSS.gif`
- **Summary Log**: `test-run-YYYYMMDD-HHMMSS.log`
- **Backend/Frontend Logs**: `backend-YYYYMMDD-HHMMSS.log`, `frontend-YYYYMMDD-HHMMSS.log`

### Technical Implementation Details

#### Terminal Recording with PTY

Terminalizer requires a proper terminal environment (TTY) to function. When running in automated/CI environments, there's no real terminal available. We solve this using:

1. **`script` Command**: Unix utility that creates a pseudo-terminal (PTY)
2. **Helper Script**: `record-terminal.sh` wraps terminalizer with PTY support
3. **Command Flow**:
   ```bash
   script -q /dev/null bash -c "terminalizer record --command '<test-script>' --skip-sharing"
   ```

This approach allows Terminalizer to:

- Access terminal features (like `process.stdin.setRawMode`)
- Capture ANSI escape sequences and colors
- Record in non-interactive environments
- Work in CI/CD pipelines

#### Recording Orchestration

The `run-test-with-recording.sh` script coordinates:

1. **Service Startup**:

   - Starts backend in auto-approve mode (`pnpm dev:auto-approve`)
   - Starts frontend UI (`pnpm dev:ui`)
   - Waits for services to be ready

2. **Parallel Recording**:

   - UI recording runs in background via `record-ui.js`
   - Terminal recording captures test execution
   - Both stop automatically when tests complete

3. **Cleanup**:
   - Graceful shutdown of all processes
   - Video/recording file consolidation
   - GIF rendering from terminal recording

#### Auto-Approve Mode

For unattended test execution, the backend runs in auto-approve mode:

- All tool approval requests are automatically approved
- Enables continuous test execution without manual intervention
- Activated with `pnpm dev:auto-approve`

## Troubleshooting

1. **CCO-MCP not running**: Ensure the server is started and accessible at `http://localhost:8660`
2. **Docker issues**: Verify Docker is running and `host.docker.internal` is accessible
3. **Permission denied**: Make sure scripts are executable (`chmod +x run-test.sh run-test-with-recording.sh`)
4. **API key errors**: Check that required API keys are set in your environment
5. **Recording issues**:
   - **Dependencies not installed**: Run `./setup-recording.sh` to install all dependencies
   - **Playwright not found**: Run `pnpm install` and `pnpm playwright:install`
   - **Terminalizer TTY errors**: Ensure `script` command is available (built-in on macOS/Linux)
   - **"process.stdin.setRawMode is not a function"**: This means terminalizer is not running in a PTY - the helper script should handle this
   - **Electron/node-pty errors**: Add to package.json:
     ```json
     "pnpm": {
       "onlyBuiltDependencies": ["electron", "@homebridge/node-pty-prebuilt-multiarch"]
     }
     ```
   - **Port conflicts**: Check that ports 8660 and 5180 are available
   - **Missing recordings**: Check the recordings directory for error logs
   - **UI not starting**: Ensure `pnpm install` has been run in the `ui` directory
   - **WebM files with random names**: Playwright generates unique names; the script finds them automatically
   - **GIF rendering fails**: Ensure sufficient disk space and that terminalizer completed recording

## Adding New Tests

To add a new test scenario:

1. Add the prompt to `test-prompts.txt`
2. Add a new test case in `run-test.sh` using `run_test_scenario`
3. Run the test to verify it works as expected
