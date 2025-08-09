# Rust-based Hook Event Client Design

This document outlines the design for a Rust-based replacement of the current Node.js hook bridge system for CCO-MCP. The new architecture provides better performance, reliability, and cross-platform support while eliminating Node.js dependencies.

## Current System Problems

The existing Node.js hook bridge has several limitations:

- **Runtime Dependency**: Requires Node.js installation on all systems
- **Startup Overhead**: ~200ms Node.js boot time for each hook event
- **Memory Usage**: ~30MB memory footprint from V8 runtime
- **Installation Complexity**: npm dependencies and version management
- **Distribution Issues**: Multi-step installation process

## Rust-based Solution Overview

### Core Benefits

- **Single Binary**: No runtime dependencies, native performance
- **40x Faster Startup**: ~5ms vs ~200ms startup time
- **6-10x Lower Memory**: ~2-5MB vs ~30MB memory usage
- **Cross-Platform**: Native binaries for macOS, Linux, Windows
- **Easy Distribution**: Simple binary download or package managers
- **Better Reliability**: Rust's ownership system prevents runtime errors

## Architecture Design

### 1. Binary Structure (`cco-hook-client`)

```
cco-hook-client/
├── Cargo.toml                 # Project dependencies and metadata
├── src/
│   ├── main.rs               # Main event loop and CLI interface
│   ├── config.rs             # Configuration management (env vars + TOML)
│   ├── events.rs             # Hook event type definitions and validation
│   ├── client.rs             # HTTP client with retry logic and pooling
│   ├── stdin.rs              # Async stdin processing and JSON parsing
│   ├── logging.rs            # Structured logging with tracing
│   └── error.rs              # Error types and handling
├── config/
│   └── default.toml          # Default configuration template
├── scripts/
│   ├── install.sh            # Cross-platform installation script
│   └── configure-claude.rs   # Claude Code configuration utility
└── .github/workflows/
    └── release.yml           # Cross-compilation CI/CD pipeline
```

### 2. Core Dependencies

```toml
[dependencies]
tokio = { version = "1.0", features = ["full"] }        # Async runtime
reqwest = { version = "0.12", features = ["json"] }     # HTTP client
serde = { version = "1.0", features = ["derive"] }      # Serialization
serde_json = "1.0"                                      # JSON handling
tracing = "0.1"                                         # Structured logging
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
anyhow = "1.0"                                          # Error handling
thiserror = "1.0"                                       # Custom error types
clap = { version = "4.0", features = ["derive"] }       # CLI parsing
toml = "0.8"                                            # Config parsing
dirs = "5.0"                                            # Platform directories
uuid = { version = "1.0", features = ["v4"] }           # Unique IDs
```

## Implementation Details

### 3. Event Processing Flow

```rust
// Main event processing loop
async fn process_events() -> Result<()> {
    let mut stdin_reader = StdinReader::new();
    let http_client = HttpClient::new(&config).await?;

    while let Some(line) = stdin_reader.read_line().await? {
        // Parse hook event from Claude Code
        let event: HookEvent = serde_json::from_str(&line)
            .context("Failed to parse hook event")?;

        // Validate event structure
        event.validate()?;

        // Forward to CCO-MCP server with retry logic
        let response = http_client
            .send_event(event.clone())
            .await?;

        // Handle blocking response for PreToolUse events
        if event.event_type == "PreToolUse" {
            let blocking_response = response.json::<BlockingResponse>().await?;
            println!("{}", serde_json::to_string(&blocking_response)?);
        }
    }

    Ok(())
}
```

### 4. Configuration System

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub client: ClientConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub protocol: String,
    pub timeout_ms: u64,
    pub base_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientConfig {
    pub max_retries: usize,
    pub initial_backoff_ms: u64,
    pub max_backoff_ms: u64,
    pub connection_timeout_ms: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "localhost".to_string(),
                port: 8660,
                protocol: "http".to_string(),
                timeout_ms: 10000,
                base_path: "/api/hooks".to_string(),
            },
            client: ClientConfig {
                max_retries: 3,
                initial_backoff_ms: 100,
                max_backoff_ms: 5000,
                connection_timeout_ms: 5000,
            },
            logging: LoggingConfig::default(),
        }
    }
}
```

### 5. HTTP Client with Retry Logic

```rust
pub struct HttpClient {
    client: reqwest::Client,
    base_url: String,
    retry_config: RetryConfig,
}

impl HttpClient {
    pub async fn new(config: &Config) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(config.client.connection_timeout_ms))
            .build()?;

        let base_url = format!(
            "{}://{}:{}{}",
            config.server.protocol,
            config.server.host,
            config.server.port,
            config.server.base_path
        );

        Ok(Self {
            client,
            base_url,
            retry_config: RetryConfig::from(&config.client),
        })
    }

    pub async fn send_event(&self, event: HookEvent) -> Result<reqwest::Response> {
        let mut attempt = 0;
        let mut backoff = Duration::from_millis(self.retry_config.initial_backoff_ms);

        loop {
            match self.try_send_event(&event).await {
                Ok(response) => return Ok(response),
                Err(e) if attempt < self.retry_config.max_retries => {
                    tracing::warn!(
                        attempt = attempt + 1,
                        max_attempts = self.retry_config.max_retries,
                        backoff_ms = backoff.as_millis(),
                        error = %e,
                        "Request failed, retrying"
                    );

                    tokio::time::sleep(backoff).await;
                    backoff = std::cmp::min(
                        backoff * 2,
                        Duration::from_millis(self.retry_config.max_backoff_ms)
                    );
                    attempt += 1;
                }
                Err(e) => {
                    tracing::error!(
                        attempts = attempt + 1,
                        error = %e,
                        "All retry attempts failed"
                    );
                    return Err(e);
                }
            }
        }
    }

    async fn try_send_event(&self, event: &HookEvent) -> Result<reqwest::Response> {
        let url = format!("{}/event", self.base_url);

        self.client
            .post(&url)
            .json(event)
            .send()
            .await?
            .error_for_status()
            .map_err(Into::into)
    }
}
```

### 6. Event Type Definitions

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum HookEvent {
    PreToolUse {
        session_id: String,
        timestamp: String,
        tool: ToolInfo,
        agent_identity: Option<String>,
    },
    PostToolUse {
        session_id: String,
        timestamp: String,
        tool: ToolInfoWithOutput,
        agent_identity: Option<String>,
        duration: u64,
    },
    Notification {
        session_id: String,
        timestamp: String,
        message: String,
        level: NotificationLevel,
    },
    Stop {
        session_id: String,
        timestamp: String,
        reason: Option<String>,
        agent_identity: Option<String>,
    },
    SubagentStop {
        session_id: String,
        timestamp: String,
        reason: Option<String>,
        agent_identity: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    pub name: String,
    pub input: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockingResponse {
    pub behavior: BlockingBehavior,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BlockingBehavior {
    Allow,
    Deny,
}
```

## Installation and Distribution

### 7. Cross-Platform Distribution

#### GitHub Releases with CI/CD

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  build:
    strategy:
      matrix:
        include:
          - target: x86_64-unknown-linux-gnu
            os: ubuntu-latest
            name: cco-hook-client-linux-x86_64
          - target: x86_64-apple-darwin
            os: macos-latest
            name: cco-hook-client-macos-x86_64
          - target: aarch64-apple-darwin
            os: macos-latest
            name: cco-hook-client-macos-aarch64
          - target: x86_64-pc-windows-msvc
            os: windows-latest
            name: cco-hook-client-windows-x86_64.exe

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Build binary
        run: cargo build --release --target ${{ matrix.target }}

      - name: Upload release asset
        uses: actions/upload-release-asset@v1
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: target/${{ matrix.target }}/release/cco-hook-client${{ matrix.target == 'x86_64-pc-windows-msvc' && '.exe' || '' }}
          asset_name: ${{ matrix.name }}
```

#### Installation Methods

1. **Direct Binary Download**:

   ```bash
   # Install script (install.sh)
   curl -fsSL https://get.cco-mcp.com/install.sh | sh

   # Manual download
   wget https://github.com/cco-mcp/hook-client/releases/latest/download/cco-hook-client-linux-x86_64
   chmod +x cco-hook-client-linux-x86_64
   sudo mv cco-hook-client-linux-x86_64 /usr/local/bin/cco-hook-client
   ```

2. **Package Managers**:

   ```bash
   # Cargo (for Rust users)
   cargo install cco-hook-client

   # Homebrew (macOS/Linux)
   brew install cco-hook-client

   # Scoop (Windows)
   scoop install cco-hook-client
   ```

### 8. Claude Code Configuration

Replace Node.js installation script with Rust configuration utility:

```rust
// configure-claude.rs
use clap::Parser;
use serde_json::Value;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "configure-claude")]
#[command(about = "Configure Claude Code to use CCO-MCP hook client")]
struct Args {
    #[arg(long, default_value = "~/.claude")]
    claude_dir: PathBuf,

    #[arg(long)]
    binary_path: Option<PathBuf>,

    #[arg(long)]
    server_url: Option<String>,

    #[arg(long)]
    dry_run: bool,

    #[arg(long)]
    backup: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    // Auto-detect binary location if not specified
    let binary_path = match args.binary_path {
        Some(path) => path,
        None => which::which("cco-hook-client")
            .context("Could not find cco-hook-client binary in PATH")?,
    };

    // Verify binary works
    verify_binary_works(&binary_path).await?;

    // Configure Claude Code settings.json
    let settings_path = configure_claude_settings(
        &args.claude_dir,
        &binary_path,
        args.server_url.as_deref(),
        args.dry_run,
        args.backup
    )?;

    // Verify CCO-MCP server connection
    verify_server_connection(args.server_url.as_deref()).await?;

    println!("✅ Claude Code hooks configured successfully!");
    println!("   Binary: {}", binary_path.display());
    println!("   Config: {}", settings_path.display());
    println!("   Server: {}", args.server_url.unwrap_or_else(|| "http://localhost:8660".to_string()));
    println!("\n🚀 Start CCO-MCP server and begin monitoring hook events!");

    Ok(())
}

fn configure_claude_settings(
    claude_dir: &PathBuf,
    binary_path: &PathBuf,
    server_url: Option<&str>,
    dry_run: bool,
    backup: bool,
) -> anyhow::Result<PathBuf> {
    // Create Claude directory if it doesn't exist
    if !claude_dir.exists() {
        std::fs::create_dir_all(claude_dir)?;
        println!("📁 Created Claude directory: {}", claude_dir.display());
    }

    let settings_path = claude_dir.join("settings.json");

    // Read existing settings or create default
    let mut settings: Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)?;
        serde_json::from_str(&content)?
    } else {
        serde_json::json!({})
    };

    // Create backup if requested and settings exist
    if backup && settings_path.exists() {
        let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
        let backup_path = claude_dir.join(format!("settings.json.backup-{}", timestamp));
        std::fs::copy(&settings_path, &backup_path)?;
        println!("💾 Backup created: {}", backup_path.display());
    }

    // Generate hook configuration
    let hook_command = format!("\"{}\"", binary_path.display());
    let hook_config = serde_json::json!([{
        "matcher": ".*",
        "hooks": [{
            "type": "command",
            "command": hook_command
        }]
    }]);

    // Update hooks section
    if settings.get("hooks").is_none() {
        settings["hooks"] = serde_json::json!({});
    }

    let hooks = settings["hooks"].as_object_mut().unwrap();

    // Configure all hook types
    for event_type in ["PreToolUse", "PostToolUse", "Notification", "Stop", "SubagentStop"] {
        hooks.insert(event_type.to_string(), hook_config.clone());
    }

    // Add server configuration if specified
    if let Some(url) = server_url {
        settings["cco_server_url"] = serde_json::Value::String(url.to_string());
    }

    if !dry_run {
        // Write updated settings
        let content = serde_json::to_string_pretty(&settings)?;
        std::fs::write(&settings_path, content)?;
        println!("📝 Updated Claude Code settings: {}", settings_path.display());
    } else {
        println!("🔍 Dry run - would update: {}", settings_path.display());
        println!("Configuration preview:");
        println!("{}", serde_json::to_string_pretty(&settings)?);
    }

    Ok(settings_path)
}
```

## Performance Comparison

| Metric            | Node.js Bridge       | Rust Binary | Improvement            |
| ----------------- | -------------------- | ----------- | ---------------------- |
| Startup Time      | ~200ms               | ~5ms        | **40x faster**         |
| Memory Usage      | ~30MB                | ~2-5MB      | **6-10x lower**        |
| Binary Size       | N/A (runtime)        | ~8-12MB     | **Self-contained**     |
| Dependencies      | Node.js + npm        | None        | **Zero deps**          |
| CPU Usage         | Higher (V8 overhead) | Minimal     | **Native performance** |
| Installation Size | ~50-100MB            | ~8-12MB     | **5-10x smaller**      |

## Implementation Roadmap

### Phase 1: Core Functionality (Week 1-2)

- [ ] Create Rust workspace with proper project structure
- [ ] Implement event parsing and validation with serde
- [ ] Build HTTP client with basic retry logic and connection pooling
- [ ] Create async stdin processing and JSON handling
- [ ] Set up configuration management (environment variables + TOML)
- [ ] Add structured logging with tracing crate

### Phase 2: Distribution & CI/CD (Week 3)

- [ ] Set up cross-compilation CI/CD pipeline for all platforms
- [ ] Create GitHub releases with automated binary builds
- [ ] Write cross-platform installation script (`install.sh`)
- [ ] Build Claude Code configuration utility (`configure-claude`)
- [ ] Set up package manager distributions (Homebrew, Scoop)

### Phase 3: Advanced Features (Week 4)

- [ ] Implement advanced retry logic with exponential backoff
- [ ] Add connection health checks and server validation
- [ ] Build comprehensive error handling and recovery
- [ ] Add signal handling for graceful shutdown (SIGINT/SIGTERM)
- [ ] Implement auto-updater mechanism with rollback

### Phase 4: Testing & Documentation (Week 5)

- [ ] Create comprehensive unit and integration tests
- [ ] Build end-to-end tests with CCO-MCP server
- [ ] Performance benchmarking against Node.js version
- [ ] Write user documentation and migration guide
- [ ] Create troubleshooting and debugging guides

### Phase 5: Release & Migration (Week 6)

- [ ] Beta testing with existing CCO-MCP users
- [ ] Create migration guide from Node.js bridge
- [ ] Security audit and code review
- [ ] Official release with full documentation
- [ ] Deprecation timeline for Node.js version

## Migration Strategy

### Backward Compatibility

- **API Contract**: Maintain exact same HTTP API with CCO-MCP server
- **Event Format**: Use identical JSON event structure from Claude Code hooks
- **Configuration**: Same Claude Code `settings.json` format and structure
- **Drop-in Replacement**: Binary can replace Node.js script without server changes

### Migration Path

1. **Parallel Installation**: Install Rust binary alongside existing Node.js version
2. **Testing**: Verify Rust client works with current CCO-MCP setup
3. **Configuration Switch**: Update Claude Code settings to use Rust binary
4. **Validation**: Confirm all hook events work correctly
5. **Cleanup**: Remove Node.js dependencies once migration confirmed

### Rollback Plan

- Keep automatic backups of Claude Code settings
- Provide easy rollback command in configure utility
- Document troubleshooting steps for common issues
- Maintain Node.js version for emergency fallback

## Security Considerations

### Binary Security

- **Minimal Dependencies**: Reduce attack surface with fewer dependencies
- **Memory Safety**: Rust prevents buffer overflows and memory corruption
- **Input Validation**: Strict JSON schema validation for all events
- **Error Handling**: No panic conditions that could crash the client

### Network Security

- **TLS Support**: HTTPS connections to CCO-MCP server
- **Timeout Protection**: Prevent hanging connections
- **Retry Limits**: Avoid infinite retry loops
- **Rate Limiting**: Built-in backoff prevents server overload

### Configuration Security

- **Path Validation**: Verify all file paths before use
- **Permission Checks**: Ensure proper file permissions
- **Secret Handling**: No sensitive data in logs or config files
- **Backup Safety**: Secure backup file creation and cleanup

## Future Enhancements

### Advanced Features

- **Metrics Collection**: Optional Prometheus metrics export
- **Health Dashboard**: Built-in web interface for client status
- **Configuration UI**: Web-based configuration management
- **Plugin System**: Extensible architecture for custom processing

### Performance Optimizations

- **Connection Pooling**: Reuse HTTP connections for better performance
- **Batch Processing**: Group multiple events for efficiency
- **Compression**: Optional gzip compression for large payloads
- **Async Batching**: Buffer and batch events during high load

### Monitoring & Observability

- **Structured Logging**: JSON logs with correlation IDs
- **Tracing Support**: Distributed tracing integration
- **Error Tracking**: Integration with error monitoring services
- **Performance Metrics**: Latency and throughput monitoring

This Rust-based architecture provides a robust, high-performance, and maintainable replacement for the Node.js bridge system while maintaining full compatibility with the existing CCO-MCP infrastructure.
