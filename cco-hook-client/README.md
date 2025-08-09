# CCO Hook Client

High-performance Rust-based hook client for CCO-MCP (Claude Code Oversight). This client replaces the Node.js bridge system with a single, self-contained binary that provides significantly better performance and reliability.

## Features

- **🚀 40x Faster Startup**: ~5ms vs ~200ms startup time compared to Node.js
- **💾 6-10x Lower Memory**: ~2-5MB vs ~30MB memory usage
- **📦 Single Binary**: No runtime dependencies, native performance
- **🔄 Auto-retry Logic**: Exponential backoff with configurable retry limits
- **🔗 Connection Pooling**: HTTP keep-alive and connection reuse
- **📊 Structured Logging**: JSON, pretty, or compact log formats
- **⚙️ Flexible Configuration**: Environment variables, TOML files, and CLI options
- **🛡️ Graceful Shutdown**: Proper signal handling (SIGINT/SIGTERM)
- **✅ Drop-in Replacement**: 100% compatible with existing CCO-MCP server

## Performance Comparison

| Metric       | Node.js Bridge       | Rust Client | Improvement            |
| ------------ | -------------------- | ----------- | ---------------------- |
| Startup Time | ~200ms               | ~5ms        | **40x faster**         |
| Memory Usage | ~30MB                | ~2-5MB      | **6-10x lower**        |
| Binary Size  | N/A (runtime)        | ~8-12MB     | **Self-contained**     |
| Dependencies | Node.js + npm        | None        | **Zero deps**          |
| CPU Usage    | Higher (V8 overhead) | Minimal     | **Native performance** |

## Quick Start

### Installation

#### Option 1: Quick Install Script (Recommended)

```bash
curl -fsSL https://get.cco-mcp.com/install.sh | sh
```

#### Option 2: Manual Download

```bash
# Download the binary for your platform
wget https://github.com/toolprint/cco-mcp/releases/latest/download/cco-hook-client-linux-x86_64
chmod +x cco-hook-client-linux-x86_64
sudo mv cco-hook-client-linux-x86_64 /usr/local/bin/cco-hook-client

# Download the configuration utility
wget https://github.com/toolprint/cco-mcp/releases/latest/download/configure-claude-linux-x86_64
chmod +x configure-claude-linux-x86_64
sudo mv configure-claude-linux-x86_64 /usr/local/bin/configure-claude
```

#### Option 3: Build from Source

```bash
# Clone the repository
git clone https://github.com/toolprint/cco-mcp.git
cd cco-mcp/cco-hook-client

# Build with Cargo
cargo build --release

# Install
sudo cp target/release/cco-hook-client /usr/local/bin/
sudo cp target/release/configure-claude /usr/local/bin/
```

### Configuration

#### Automatic Configuration

```bash
# Configure Claude Code automatically
configure-claude

# Or with custom settings
configure-claude --server-url http://localhost:8660 --backup
```

#### Manual Configuration

Add to your Claude Code `settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "cco-hook-client"
          }
        ]
      }
    ],
    "PostToolUse": [
      /* same as above */
    ],
    "Notification": [
      /* same as above */
    ],
    "Stop": [
      /* same as above */
    ],
    "SubagentStop": [
      /* same as above */
    ]
  }
}
```

### Usage

The hook client runs automatically when Claude Code executes tools. You can also test it manually:

```bash
# Test with dry run
echo '{"type":"PreToolUse","sessionId":"test","timestamp":"2024-01-01T00:00:00Z","tool":{"name":"TestTool","input":{}}}' | cco-hook-client --dry-run

# Health check
cco-hook-client --health-check

# Validate configuration
cco-hook-client validate

# Show version
cco-hook-client --version
```

## Configuration

### Configuration Sources (in order of priority)

1. Command line arguments
2. Environment variables
3. `./cco-hook-client.toml`
4. `~/.config/cco-hook-client/config.toml`
5. Default values

### Environment Variables

```bash
# Server configuration
export CCO_SERVER_HOST=localhost
export CCO_SERVER_PORT=8660
export CCO_SERVER_PROTOCOL=http
export CCO_SERVER_TIMEOUT_MS=10000

# Client configuration
export CCO_CLIENT_MAX_RETRIES=3
export CCO_CLIENT_INITIAL_BACKOFF_MS=100
export CCO_CLIENT_MAX_BACKOFF_MS=5000

# Logging configuration
export CCO_LOG_LEVEL=info
export CCO_LOG_FORMAT=pretty
export CCO_LOG_FILE=/var/log/cco-hook-client.log
```

### TOML Configuration File

```toml
[server]
host = "localhost"
port = 8660
protocol = "http"
timeout_ms = 10000
base_path = "/api/hooks"

[client]
max_retries = 3
initial_backoff_ms = 100
max_backoff_ms = 5000
connection_timeout_ms = 5000
keep_alive = true
pool_max_idle_per_host = 10

[logging]
level = "info"
format = "pretty"
file_path = "/var/log/cco-hook-client.log"
max_file_size_mb = 10
max_files = 5
```

Generate a default config file:

```bash
cco-hook-client config --output my-config.toml
```

## CLI Reference

```bash
cco-hook-client [OPTIONS] [COMMAND]

COMMANDS:
  run        Run the hook client (default)
  config     Generate default configuration file
  validate   Validate configuration
  version    Show version information

OPTIONS:
  -c, --config <FILE>     Configuration file path
  -l, --log-level <LEVEL> Log level (trace, debug, info, warn, error)
  -s, --server <URL>      Server URL override
  -v, --verbose           Enable verbose output
  -d, --dry-run           Parse events but don't send to server
      --health-check      Test server connection and exit
  -h, --help              Print help information
```

## Development

### Prerequisites

- Rust 1.70+ (MSRV)
- Cargo

### Building

```bash
# Development build
cargo build

# Release build (optimized)
cargo build --release

# Run tests
cargo test

# Run with specific log level
RUST_LOG=debug cargo run -- --dry-run

# Cross-compile for different targets
cargo build --target x86_64-pc-windows-msvc
```

### Testing

```bash
# Unit tests
cargo test

# Integration tests with real server
cargo test --test integration

# Test with sample events
echo '{"type":"PreToolUse","sessionId":"test","timestamp":"2024-01-01T00:00:00Z","tool":{"name":"TestTool","input":{}}}' | \
  cargo run -- --dry-run
```

### Linting and Formatting

```bash
# Check formatting
cargo fmt --check

# Fix formatting
cargo fmt

# Run clippy
cargo clippy -- -D warnings

# Fix clippy suggestions
cargo clippy --fix
```

## Architecture

### Core Components

- **`main.rs`**: CLI interface and application entry point
- **`events.rs`**: Event type definitions matching CCO-MCP API
- **`client.rs`**: HTTP client with retry logic and connection pooling
- **`stdin.rs`**: Async stdin reader for JSON event processing
- **`config.rs`**: Configuration management with environment/TOML support
- **`logging.rs`**: Structured logging with tracing integration
- **`error.rs`**: Comprehensive error handling with context

### Event Processing Flow

```
Claude Code → stdin (JSON) → Event Parser → HTTP Client → CCO-MCP Server
                                     ↓
                                 Blocking Response (PreToolUse only)
                                     ↓
                                 stdout → Claude Code
```

### HTTP Client Features

- **Connection Pooling**: Reuses HTTP connections for better performance
- **Exponential Backoff**: Smart retry logic with jitter to avoid thundering herd
- **Timeout Handling**: Configurable timeouts at multiple levels
- **Error Classification**: Distinguishes between retryable and permanent errors
- **Health Checking**: Built-in server connectivity verification

## Troubleshooting

### Common Issues

#### Binary Not Found

```bash
# Check if binary is in PATH
which cco-hook-client

# Add to PATH if needed
export PATH="/usr/local/bin:$PATH"
```

#### Permission Denied

```bash
# Make binary executable
chmod +x /path/to/cco-hook-client

# Or reinstall with proper permissions
sudo chmod +x /usr/local/bin/cco-hook-client
```

#### Server Connection Failed

```bash
# Test server connectivity
cco-hook-client --health-check

# Check server is running
curl http://localhost:8660/api/hooks/health

# Verify configuration
cco-hook-client validate
```

#### Claude Code Not Using Hook Client

```bash
# Verify settings.json configuration
cat ~/.claude/settings.json | jq '.hooks'

# Reconfigure Claude Code
configure-claude --force
```

### Debug Mode

```bash
# Enable debug logging
cco-hook-client --log-level debug

# Or with environment variable
CCO_LOG_LEVEL=debug cco-hook-client

# Save logs to file
cco-hook-client --log-level debug 2> debug.log
```

### Performance Issues

#### Startup Time

The binary should start in <10ms. If slower:

- Check if binary is on local disk (not network mount)
- Verify sufficient RAM available
- Try release build instead of debug build

#### Memory Usage

Should use <5MB RAM. If higher:

- Check for memory leaks in logs
- Verify connection pooling is working
- Monitor with `ps` or `top`

#### Network Latency

For high-latency networks:

- Increase `timeout_ms` in configuration
- Reduce `max_retries` to fail faster
- Use connection keep-alive (enabled by default)

## Migration from Node.js Bridge

### Compatibility

The Rust client is a drop-in replacement:

- ✅ Same HTTP API contract with CCO-MCP server
- ✅ Identical JSON event format
- ✅ Same Claude Code settings.json structure
- ✅ Same environment variables

### Migration Steps

1. **Install Rust client**: Use installation script or manual download
2. **Test functionality**: Run `cco-hook-client --dry-run`
3. **Update Claude settings**: Run `configure-claude --backup`
4. **Verify operation**: Monitor CCO-MCP dashboard for events
5. **Remove Node.js version**: Clean up old bridge.js file

### Rollback Plan

If issues occur:

1. Restore settings backup: `cp settings.json.backup-* settings.json`
2. Reinstall Node.js bridge: Follow original setup instructions
3. Report issue: Create GitHub issue with logs

## Contributing

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/your-fork/cco-mcp.git
cd cco-mcp/cco-hook-client

# Create a feature branch
git checkout -b feature/your-feature

# Make changes and test
cargo test
cargo clippy

# Commit and push
git commit -m "feat: your feature description"
git push origin feature/your-feature
```

### Code Style

- Follow Rust standard formatting (`cargo fmt`)
- Address all clippy warnings (`cargo clippy`)
- Add tests for new functionality
- Update documentation as needed
- Use conventional commit messages

### Release Process

Releases are automated via GitHub Actions:

1. Create and push a version tag: `git tag v0.1.0 && git push origin v0.1.0`
2. GitHub Actions builds cross-platform binaries
3. Creates release with downloadable assets
4. Updates package managers (if applicable)

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## Support

- 📖 Documentation: [GitHub Wiki](https://github.com/toolprint/cco-mcp/wiki)
- 🐛 Bug Reports: [GitHub Issues](https://github.com/toolprint/cco-mcp/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/toolprint/cco-mcp/discussions)
- 📧 Email: [support@cco-mcp.com](mailto:support@cco-mcp.com)

---

Made with ❤️ by the CCO-MCP team. Contributions welcome!
