mod client;
mod config;
mod error;
mod events;
mod logging;
mod stdin;

use clap::{Parser, Subcommand};
use std::process;
use std::sync::Arc;
use std::time::Instant;
use tokio::signal;
use tracing::{debug, error, info, warn};

use crate::client::HttpClient;
use crate::config::{load_config, Config};
use crate::error::{HookClientError, Result};
use crate::events::{BlockingResponse, EventMetadata, HookEvent};
use crate::logging::{init_logging, init_minimal_logging, PerformanceTimer};
use crate::stdin::{is_piped_input, StdinReader, StdinStats};

#[derive(Parser)]
#[command(
    name = "cco-hook-client",
    version = env!("CARGO_PKG_VERSION"),
    about = "High-performance Rust-based hook client for CCO-MCP (Claude Code Oversight)",
    long_about = "CCO Hook Client processes Claude Code hook events and forwards them to a CCO-MCP server for approval/denial decisions. This is a drop-in replacement for the Node.js bridge with significantly better performance."
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Configuration file path
    #[arg(short, long, value_name = "FILE")]
    config: Option<std::path::PathBuf>,

    /// Log level (trace, debug, info, warn, error)
    #[arg(short, long, default_value = "info")]
    log_level: String,

    /// Server URL override
    #[arg(short, long, value_name = "URL")]
    server: Option<String>,

    /// Enable verbose output
    #[arg(short, long)]
    verbose: bool,

    /// Dry run mode (parse events but don't send to server)
    #[arg(short, long)]
    dry_run: bool,

    /// Health check only (test server connection and exit)
    #[arg(long)]
    health_check: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the hook client (default mode)
    Run {
        /// Buffer size for stdin processing
        #[arg(long, default_value = "100")]
        buffer_size: usize,
    },
    /// Generate default configuration file
    Config {
        /// Output path for config file
        #[arg(short, long, default_value = "cco-hook-client.toml")]
        output: std::path::PathBuf,
    },
    /// Validate configuration
    Validate,
    /// Show version information
    Version,
    /// Check installation and configuration status
    Status {
        /// Show detailed status information
        #[arg(long)]
        detailed: bool,
    },
}

#[tokio::main]
async fn main() {
    // Skip pre-initialization logging to avoid conflicts

    // Parse CLI arguments
    let cli = Cli::parse();

    // Run the appropriate command
    if let Err(e) = run_cli(cli).await {
        error!(error = %e, "Application failed");
        
        // Print user-friendly error messages and use correct exit codes
        // Exit code 2 is reserved for blocking errors per Claude Code spec
        if e.is_blocking_error() {
            eprintln!("Blocking error: {}", e);
            process::exit(2); // Blocking error - stops Claude Code execution
        } else if e.is_client_error() {
            eprintln!("Configuration error: {}", e);
            process::exit(1); // Non-blocking error
        } else if e.is_server_error() {
            eprintln!("Server error: {}", e);
            process::exit(1); // Non-blocking error
        } else {
            eprintln!("Fatal error: {}", e);
            process::exit(1); // Non-blocking error
        }
    }
}

async fn run_cli(cli: Cli) -> Result<()> {
    match cli.command {
        Some(Commands::Config { output }) => generate_config_file(output).await,
        Some(Commands::Validate) => validate_config(cli.config).await,
        Some(Commands::Version) => show_version(),
        Some(Commands::Status { detailed }) => check_installation_status(detailed).await,
        Some(Commands::Run { buffer_size }) => {
            run_hook_client(cli, buffer_size).await
        }
        None => {
            run_hook_client(cli, 100).await // Default buffer size
        }
    }
}

async fn generate_config_file(output_path: std::path::PathBuf) -> Result<()> {
    let default_config = config::generate_default_config()?;
    
    if output_path.exists() {
        return Err(HookClientError::config(format!(
            "Configuration file already exists: {}",
            output_path.display()
        )));
    }

    std::fs::write(&output_path, default_config).map_err(|e| {
        HookClientError::config(format!(
            "Failed to write config file {}: {}",
            output_path.display(),
            e
        ))
    })?;

    println!("✅ Default configuration written to: {}", output_path.display());
    println!("📝 Edit the file to customize your settings");
    println!("🚀 Run with: cco-hook-client --config {}", output_path.display());

    Ok(())
}

async fn validate_config(_config_path: Option<std::path::PathBuf>) -> Result<()> {
    let config = load_config()?;
    
    println!("✅ Configuration is valid");
    println!("📊 Configuration details:");
    println!("   Server: {}", config.server.url()?);
    println!("   Timeout: {}ms", config.server.timeout_ms);
    println!("   Max retries: {}", config.client.max_retries);
    println!("   Log level: {}", config.logging.level);
    println!("   Log format: {}", config.logging.format);

    // Test server connection if possible
    match HttpClient::new(&config).await {
        Ok(client) => {
            println!("🔗 Testing server connection...");
            match client.health_check().await {
                Ok(()) => println!("✅ Server connection successful"),
                Err(e) => {
                    println!("⚠️  Server connection failed: {}", e);
                    println!("   This is normal if the server is not running");
                }
            }
        }
        Err(e) => {
            println!("⚠️  HTTP client creation failed: {}", e);
        }
    }

    Ok(())
}

fn show_version() -> Result<()> {
    println!("cco-hook-client {}", env!("CARGO_PKG_VERSION"));
    println!("Built with Rust (version not available at compile time)");
    println!("Platform: {}", std::env::consts::OS);
    println!("Architecture: {}", std::env::consts::ARCH);
    
    #[cfg(debug_assertions)]
    println!("Build: debug");
    #[cfg(not(debug_assertions))]
    println!("Build: release");
    
    println!("\nHomepage: {}", env!("CARGO_PKG_HOMEPAGE"));
    println!("Repository: {}", env!("CARGO_PKG_REPOSITORY"));
    
    Ok(())
}

async fn check_installation_status(detailed: bool) -> Result<()> {
    println!("🔍 CCO Hook Client Installation Status");
    println!();

    // Check binary location and version
    let binary_path = std::env::current_exe()
        .unwrap_or_else(|_| std::path::PathBuf::from("cco-hook-client"));
    
    println!("📦 Binary Information:");
    println!("   Location: {}", binary_path.display());
    println!("   Version: {}", env!("CARGO_PKG_VERSION"));
    
    // Check if binary is in PATH
    match which::which("cco-hook-client") {
        Ok(path_location) => {
            if path_location == binary_path {
                println!("   ✅ Available in PATH");
            } else {
                println!("   ⚠️  Different version in PATH: {}", path_location.display());
            }
        }
        Err(_) => {
            println!("   ⚠️  Not found in PATH");
        }
    }
    
    println!();

    // Check Claude Code configuration
    println!("🎭 Claude Code Configuration:");
    let claude_dir = dirs::home_dir()
        .map(|home| home.join(".claude"))
        .unwrap_or_else(|| std::path::PathBuf::from("~/.claude"));
    
    let settings_path = claude_dir.join("settings.json");
    
    if !settings_path.exists() {
        println!("   ❌ No Claude Code settings found at: {}", settings_path.display());
        println!("   💡 Run: configure-claude to set up hooks");
        println!();
        return Ok(());
    }
    
    match std::fs::read_to_string(&settings_path) {
        Ok(content) => {
            match serde_json::from_str::<serde_json::Value>(&content) {
                Ok(settings) => {
                    println!("   📁 Settings file: {}", settings_path.display());
                    
                    // Check for hook configuration
                    if let Some(hooks) = settings.get("hooks") {
                        let mut hook_count = 0;
                        let mut cco_hooks = 0;
                        
                        if let Some(hooks_obj) = hooks.as_object() {
                            for (event_type, hook_configs) in hooks_obj {
                                if let Some(configs) = hook_configs.as_array() {
                                    hook_count += configs.len();
                                    
                                    for config in configs {
                                        if let Some(hooks_array) = config.get("hooks").and_then(|h| h.as_array()) {
                                            for hook in hooks_array {
                                                if let Some(command) = hook.get("command").and_then(|c| c.as_str()) {
                                                    if command.contains("cco-hook-client") {
                                                        cco_hooks += 1;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                if detailed {
                                    println!("     - {}: configured", event_type);
                                }
                            }
                        }
                        
                        if cco_hooks > 0 {
                            println!("   ✅ CCO hooks configured ({} event types)", cco_hooks);
                        } else {
                            println!("   ⚠️  Hooks configured but not using cco-hook-client");
                        }
                        
                        if detailed {
                            println!("   📊 Total hooks: {}, CCO hooks: {}", hook_count, cco_hooks);
                        }
                    } else {
                        println!("   ❌ No hooks configured in settings.json");
                        println!("   💡 Run: configure-claude to set up hooks");
                    }
                    
                    // Check CCO metadata
                    if let Some(server_url) = settings.get("cco_server_url").and_then(|u| u.as_str()) {
                        println!("   🌐 Server URL: {}", server_url);
                    }
                    
                    if let Some(version) = settings.get("cco_hook_client_version").and_then(|v| v.as_str()) {
                        println!("   📌 Configured with version: {}", version);
                        if version != env!("CARGO_PKG_VERSION") {
                            println!("   ⚠️  Version mismatch! Current: {}", env!("CARGO_PKG_VERSION"));
                        }
                    }
                    
                    if let Some(configured_at) = settings.get("cco_configured_at").and_then(|t| t.as_str()) {
                        println!("   ⏰ Configured at: {}", configured_at);
                    }
                }
                Err(e) => {
                    println!("   ❌ Invalid JSON in settings file: {}", e);
                }
            }
        }
        Err(e) => {
            println!("   ❌ Cannot read settings file: {}", e);
        }
    }
    
    println!();

    // Check server connectivity
    println!("🌐 Server Connectivity:");
    let config = match load_config() {
        Ok(config) => config,
        Err(e) => {
            println!("   ❌ Cannot load configuration: {}", e);
            return Ok(());
        }
    };
    
    println!("   🎯 Target server: {}", config.server.url()?);
    
    match HttpClient::new(&config).await {
        Ok(client) => {
            println!("   ✅ HTTP client created successfully");
            
            match client.health_check().await {
                Ok(()) => {
                    println!("   ✅ Server is healthy and responding");
                }
                Err(e) => {
                    println!("   ❌ Health check failed: {}", e);
                    println!("   💡 Make sure CCO-MCP server is running");
                }
            }
        }
        Err(e) => {
            println!("   ❌ Cannot create HTTP client: {}", e);
        }
    }
    
    if detailed {
        println!();
        println!("🔧 Configuration Details:");
        println!("   Timeout: {}ms", config.server.timeout_ms);
        println!("   Max retries: {}", config.client.max_retries);
        println!("   Log level: {}", config.logging.level);
        println!("   Log format: {}", config.logging.format);
    }
    
    println!();
    println!("🚀 Next Steps:");
    println!("   • To configure hooks: configure-claude");
    println!("   • To test connection: cco-hook-client --health-check");
    println!("   • To validate config: cco-hook-client validate");
    
    Ok(())
}

async fn run_hook_client(cli: Cli, buffer_size: usize) -> Result<()> {
    // Load configuration
    let mut config = load_config()?;
    
    // Apply CLI overrides
    if let Some(server_url) = cli.server {
        // Parse the server URL and update config
        let url = server_url.parse::<url::Url>()
            .map_err(|_| HookClientError::invalid_url(&server_url))?;
        
        config.server.protocol = url.scheme().to_string();
        config.server.host = url.host_str().unwrap_or("localhost").to_string();
        config.server.port = url.port().unwrap_or(if url.scheme() == "https" { 443 } else { 80 });
        
        if let Some(path) = url.path().strip_prefix('/').filter(|p| !p.is_empty()) {
            config.server.base_path = format!("/{}", path);
        }
    }

    if cli.verbose {
        config.logging.level = "debug".to_string();
    }

    // Initialize full logging
    let _guard = init_logging(&config.logging)?;

    log_startup_info!(config);

    // Log Claude Code environment information
    if let Some(project_dir) = &config.environment.claude_project_dir {
        info!(
            project_dir = %project_dir.display(),
            "Claude Code project directory detected"
        );
    } else {
        debug!("CLAUDE_PROJECT_DIR not set - using current directory as project root");
    }

    // Validate that we're receiving piped input
    if !is_piped_input() && !cli.dry_run && !cli.health_check {
        warn!("No piped input detected. CCO Hook Client expects JSON events from Claude Code via stdin.");
        warn!("Usage: claude-code-command | cco-hook-client");
        warn!("Use --dry-run flag to test without stdin input");
    }

    // Health check mode
    if cli.health_check {
        return perform_health_check(&config).await;
    }

    // Create HTTP client
    let http_client = Arc::new(HttpClient::new(&config).await?);
    
    // Setup graceful shutdown
    let shutdown_signal = setup_shutdown_handling()?;
    
    // Run the main event processing loop
    if cli.dry_run {
        run_dry_run_mode(config).await
    } else {
        run_event_processing_loop(http_client, shutdown_signal, buffer_size).await
    }
}

async fn perform_health_check(config: &Config) -> Result<()> {
    info!("Performing health check");
    
    let client = HttpClient::new(config).await?;
    
    println!("🔍 Checking server connection...");
    println!("   Server: {}", config.server.url()?);
    
    match client.health_check().await {
        Ok(()) => {
            println!("✅ Server is healthy and responding");
            Ok(())
        }
        Err(e) => {
            println!("❌ Health check failed: {}", e);
            Err(e)
        }
    }
}

async fn run_dry_run_mode(config: Config) -> Result<()> {
    info!("Running in dry-run mode (events will not be sent to server)");
    
    let mut reader = StdinReader::new();
    let mut stats = StdinStats::new();
    
    println!("🔍 Dry run mode - reading and validating events from stdin");
    println!("   Server URL: {} (not contacted)", config.server.url()?);
    
    while let Some((event, metadata)) = reader.read_event().await? {
        stats.increment_events_parsed();
        
        println!("📥 Event {}: {} ({})", 
            stats.events_parsed,
            event.event_type(), 
            metadata.id
        );
        
        if let Some(tool_name) = event.tool_name() {
            println!("   Tool: {}", tool_name);
        }
        
        if event.requires_response() {
            let mock_response = BlockingResponse::allow("Dry run - would allow");
            println!("📤 Mock response: {} - {}", 
                mock_response.behavior,
                &mock_response.message
            );
            
            // Output the blocking response for compatibility
            let json_response = serde_json::to_string(&mock_response)?;
            println!("{}", json_response);
        }
    }
    
    println!("📊 Dry run complete - processed {} events", stats.events_parsed);
    Ok(())
}

async fn run_event_processing_loop(
    http_client: Arc<HttpClient>,
    mut shutdown_signal: tokio::sync::watch::Receiver<()>,
    buffer_size: usize,
) -> Result<()> {
    info!(
        buffer_size = buffer_size,
        "Starting event processing loop"
    );

    let mut reader = StdinReader::new();
    let mut stats = StdinStats::new();
    let mut consecutive_errors = 0;
    const MAX_CONSECUTIVE_ERRORS: usize = 10;

    loop {
        tokio::select! {
            // Handle shutdown signal
            _ = shutdown_signal.changed() => {
                info!("Shutdown signal received, stopping event processing");
                break;
            }
            
            // Process next event
            event_result = reader.read_event() => {
                match event_result {
                    Ok(Some((event, metadata))) => {
                        stats.increment_events_parsed();
                        consecutive_errors = 0; // Reset error counter on success
                        
                        let _timer = PerformanceTimer::new("event_processing");
                        let _span = event_span!(event, metadata);
                        
                        log_event_received!(event, metadata);
                        
                        // Process the event
                        match process_single_event(&http_client, event, metadata).await {
                            Ok(()) => {
                                debug!("Event processed successfully");
                            }
                            Err(e) => {
                                error!(error = %e, "Failed to process event");
                                
                                // If it's a blocking error, we need to exit with code 2
                                if e.is_blocking_error() {
                                    return Err(e);
                                }
                                
                                // For PreToolUse events, output a default allow response on error
                                if let Ok(Some((retry_event, _))) = reader.read_event().await {
                                    if retry_event.requires_response() {
                                        let error_response = BlockingResponse::allow(
                                            format!("Processing error, defaulting to allow: {}", e)
                                        );
                                        
                                        if let Ok(json) = serde_json::to_string(&error_response) {
                                            println!("{}", json);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Ok(None) => {
                        info!("End of input stream, shutting down");
                        break;
                    }
                    Err(e) => {
                        error!(error = %e, "Error reading from stdin");
                        consecutive_errors += 1;
                        
                        if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                            error!(
                                consecutive_errors = consecutive_errors,
                                max_errors = MAX_CONSECUTIVE_ERRORS,
                                "Too many consecutive errors, shutting down"
                            );
                            return Err(e);
                        }
                        
                        // Brief pause before retrying
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                }
            }
        }
    }

    info!(
        events_processed = stats.events_parsed,
        parse_errors = stats.parse_errors,
        success_rate = format!("{:.2}%", stats.success_rate() * 100.0),
        "Event processing completed"
    );

    Ok(())
}

async fn process_single_event(
    http_client: &HttpClient,
    event: HookEvent,
    metadata: EventMetadata,
) -> Result<()> {
    let start_time = Instant::now();
    
    // Send event to server
    let blocking_response = http_client.send_event(&event).await?;
    
    let processing_time = start_time.elapsed().as_millis() as u64;
    
    // Handle blocking response for PreToolUse events
    if let Some(response) = blocking_response {
        log_blocking_response!(metadata.id, response, processing_time);
        
        // Output the response to stdout for Claude Code
        let json_response = serde_json::to_string(&response)?;
        println!("{}", json_response);
        
        // If the response is a deny, return a blocking error
        // This will cause the process to exit with code 2
        if response.is_denied() {
            return Err(HookClientError::blocking_error(
                format!("Tool execution denied: {}", response.message)
            ));
        }
    }
    
    Ok(())
}

fn setup_shutdown_handling() -> Result<tokio::sync::watch::Receiver<()>> {
    let (tx, rx) = tokio::sync::watch::channel(());
    
    tokio::spawn(async move {
        let mut sigint = signal::unix::signal(signal::unix::SignalKind::interrupt())
            .expect("Failed to install SIGINT handler");
        let mut sigterm = signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler");
        
        tokio::select! {
            _ = sigint.recv() => {
                info!("Received SIGINT, initiating graceful shutdown");
            }
            _ = sigterm.recv() => {
                info!("Received SIGTERM, initiating graceful shutdown");
            }
        }
        
        let _ = tx.send(());
    });
    
    Ok(rx)
}

// Macros are defined in logging.rs and available through #[macro_export]

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_parsing() {
        // Test basic CLI parsing without executing
        let cli = Cli::try_parse_from(&["cco-hook-client", "--help"]);
        assert!(cli.is_err()); // --help causes clap to exit with error code
        
        // Test valid args
        let cli = Cli::try_parse_from(&["cco-hook-client", "--dry-run"]).unwrap();
        assert!(cli.dry_run);
    }

    #[test]
    fn test_version_command() {
        // Should not panic
        let result = show_version();
        assert!(result.is_ok());
    }
}