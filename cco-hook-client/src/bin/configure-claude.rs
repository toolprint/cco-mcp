use clap::Parser;
use serde_json::{json, Value};
use std::io;
use std::path::{Path, PathBuf};
use std::process;
use tracing::{error, info, warn};

use cco_hook_client::{
    error::{HookClientError, Result},
    logging::init_minimal_logging,
    HttpClient,
};

#[derive(Parser)]
#[command(
    name = "configure-claude",
    version = env!("CARGO_PKG_VERSION"),
    about = "Configure Claude Code to use the CCO-MCP hook client",
    long_about = "This utility automatically configures Claude Code to use the cco-hook-client binary for processing hook events. It updates the Claude Code settings.json file with the appropriate hook configuration."
)]
struct Args {
    /// Claude Code configuration directory
    #[arg(long, default_value = "~/.claude")]
    claude_dir: String,

    /// Path to cco-hook-client binary
    #[arg(long)]
    binary_path: Option<PathBuf>,

    /// CCO-MCP server URL
    #[arg(long, default_value = "http://localhost:8660")]
    server_url: String,

    /// Dry run mode (show changes without applying)
    #[arg(long)]
    dry_run: bool,

    /// Create backup of existing settings
    #[arg(long)]
    backup: bool,

    /// Force overwrite existing hook configuration
    #[arg(long)]
    force: bool,

    /// Verbose output
    #[arg(short, long)]
    verbose: bool,
    
    /// Uninstall hooks from Claude Code
    #[arg(long)]
    uninstall: bool,
    
    /// Skip confirmation prompts
    #[arg(short, long)]
    yes: bool,
}

#[tokio::main]
async fn main() {
    // Initialize minimal logging
    if let Err(e) = init_minimal_logging() {
        eprintln!("Failed to initialize logging: {}", e);
        process::exit(1);
    }

    let args = Args::parse();

    if let Err(e) = run_configure_claude(args).await {
        error!(error = %e, "Configuration failed");
        eprintln!("❌ Configuration failed: {}", e);
        process::exit(1);
    }
}

async fn run_configure_claude(args: Args) -> Result<()> {
    // Set log level if verbose
    if args.verbose {
        // Re-initialize with debug level
        // This is a simple approach; in production you might want a more sophisticated solution
    }

    // Handle uninstall mode
    if args.uninstall {
        info!("Starting Claude Code hook uninstallation");
        let claude_dir = expand_tilde(&args.claude_dir)?;
        return uninstall_hooks(&claude_dir, args.dry_run, args.backup, args.yes).await;
    }

    info!("Starting Claude Code configuration");

    // Expand tilde in claude_dir
    let claude_dir = expand_tilde(&args.claude_dir)?;
    
    // Auto-detect or validate binary path
    let binary_path = resolve_binary_path(args.binary_path)?;
    
    // Verify binary works
    verify_binary_works(&binary_path).await?;
    
    // Test server connection
    test_server_connection(&args.server_url).await?;
    
    // Configure Claude Code settings
    let settings_path = configure_claude_settings(
        &claude_dir,
        &binary_path,
        &args.server_url,
        args.dry_run,
        args.backup,
        args.force,
    )?;
    
    // Success message
    print_success_message(&binary_path, &settings_path, &args.server_url);
    
    Ok(())
}

fn expand_tilde(path: &str) -> Result<PathBuf> {
    if path.starts_with('~') {
        if let Some(home) = dirs::home_dir() {
            Ok(home.join(path.strip_prefix("~/").unwrap_or(&path[1..])))
        } else {
            Err(HookClientError::claude_config(
                "Could not determine home directory"
            ))
        }
    } else {
        Ok(PathBuf::from(path))
    }
}

fn resolve_binary_path(provided_path: Option<PathBuf>) -> Result<PathBuf> {
    match provided_path {
        Some(path) => {
            if !path.exists() {
                return Err(HookClientError::claude_config(format!(
                    "Binary not found at specified path: {}",
                    path.display()
                )));
            }
            
            if !path.is_file() {
                return Err(HookClientError::claude_config(format!(
                    "Path is not a file: {}",
                    path.display()
                )));
            }
            
            // Convert to absolute path to avoid issues with relative paths
            let absolute_path = std::fs::canonicalize(&path).map_err(|e| {
                HookClientError::claude_config(format!(
                    "Failed to resolve absolute path for {}: {}",
                    path.display(),
                    e
                ))
            })?;
            
            info!(path = %absolute_path.display(), "Using specified binary path (resolved to absolute)");
            Ok(absolute_path)
        }
        None => {
            // Auto-detect binary in PATH
            match which::which("cco-hook-client") {
                Ok(path) => {
                    info!(path = %path.display(), "Auto-detected binary in PATH");
                    Ok(path)
                }
                Err(_) => {
                    return Err(HookClientError::claude_config(
                        "Could not find cco-hook-client binary in PATH. Please specify --binary-path or ensure the binary is in PATH."
                    ));
                }
            }
        }
    }
}

async fn verify_binary_works(binary_path: &Path) -> Result<()> {
    info!("Verifying binary functionality");

    let output = tokio::process::Command::new(binary_path)
        .arg("--version")
        .output()
        .await
        .map_err(|e| {
            HookClientError::claude_config(format!(
                "Failed to execute binary {}: {}",
                binary_path.display(),
                e
            ))
        })?;

    if !output.status.success() {
        return Err(HookClientError::claude_config(format!(
            "Binary failed to run: exit code {}",
            output.status.code().unwrap_or(-1)
        )));
    }

    let version_output = String::from_utf8_lossy(&output.stdout);
    info!("Binary verification successful: {}", version_output.trim());

    Ok(())
}

async fn test_server_connection(server_url: &str) -> Result<()> {
    info!(server_url = %server_url, "Testing server connection");

    // Parse the server URL
    let url = server_url.parse::<url::Url>()
        .map_err(|_| HookClientError::invalid_url(server_url))?;

    // Create a temporary config for testing
    let mut config = cco_hook_client::config::Config::default();
    config.server.protocol = url.scheme().to_string();
    config.server.host = url.host_str().unwrap_or("localhost").to_string();
    config.server.port = url.port().unwrap_or(if url.scheme() == "https" { 443 } else { 80 });
    
    if let Some(path) = url.path().strip_prefix('/').filter(|p| !p.is_empty()) {
        config.server.base_path = format!("/{}", path);
    }

    // Try to create HTTP client and test connection
    match HttpClient::new(&config).await {
        Ok(client) => {
            match client.health_check().await {
                Ok(()) => {
                    info!("Server connection test successful");
                    Ok(())
                }
                Err(e) => {
                    warn!(
                        error = %e,
                        "Server connection test failed, but continuing (server may not be running)"
                    );
                    // Don't fail configuration if server is not running
                    Ok(())
                }
            }
        }
        Err(e) => {
            warn!(
                error = %e,
                "Failed to create HTTP client, but continuing"
            );
            // Don't fail configuration for HTTP client issues
            Ok(())
        }
    }
}

fn configure_claude_settings(
    claude_dir: &Path,
    binary_path: &Path,
    server_url: &str,
    dry_run: bool,
    backup: bool,
    force: bool,
) -> Result<PathBuf> {
    info!(
        claude_dir = %claude_dir.display(),
        binary_path = %binary_path.display(),
        server_url = %server_url,
        "Configuring Claude Code settings"
    );

    // Create Claude directory if it doesn't exist
    if !claude_dir.exists() {
        if !dry_run {
            std::fs::create_dir_all(claude_dir).map_err(|e| {
                HookClientError::claude_config(format!(
                    "Failed to create Claude directory {}: {}",
                    claude_dir.display(),
                    e
                ))
            })?;
        }
        info!("Created Claude directory: {}", claude_dir.display());
    }

    let settings_path = claude_dir.join("settings.json");

    // Read existing settings or create default
    let mut settings: Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path).map_err(|e| {
            HookClientError::claude_config(format!(
                "Failed to read settings file {}: {}",
                settings_path.display(),
                e
            ))
        })?;
        
        serde_json::from_str(&content).map_err(|e| {
            HookClientError::claude_config(format!(
                "Failed to parse settings file {}: {}",
                settings_path.display(),
                e
            ))
        })?
    } else {
        json!({})
    };

    // Create backup if requested and settings exist
    if backup && settings_path.exists() && !dry_run {
        let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
        let backup_path = claude_dir.join(format!("settings.json.backup-{}", timestamp));
        std::fs::copy(&settings_path, &backup_path).map_err(|e| {
            HookClientError::claude_config(format!(
                "Failed to create backup {}: {}",
                backup_path.display(),
                e
            ))
        })?;
        info!("Backup created: {}", backup_path.display());
    }

    // Check for existing hook configuration
    if settings.get("hooks").is_some() && !force {
        warn!("Existing hook configuration found in settings.json");
        warn!("Use --force to overwrite existing configuration");
        return Err(HookClientError::claude_config(
            "Existing hook configuration found. Use --force to overwrite."
        ));
    }

    // Generate hook configuration
    let hook_command = binary_path.to_string_lossy().to_string();
    let hook_config = json!([{
        "matcher": ".*",
        "hooks": [{
            "type": "command",
            "command": hook_command
        }]
    }]);

    // Update hooks section
    if settings.get("hooks").is_none() {
        settings["hooks"] = json!({});
    }

    let hooks = settings["hooks"].as_object_mut().unwrap();

    // Configure all hook types
    for event_type in ["PreToolUse", "PostToolUse", "Notification", "Stop", "SubagentStop"] {
        hooks.insert(event_type.to_string(), hook_config.clone());
    }

    // Add server configuration as metadata
    settings["cco_server_url"] = json!(server_url);
    settings["cco_hook_client_version"] = json!(env!("CARGO_PKG_VERSION"));
    settings["cco_configured_at"] = json!(chrono::Utc::now().to_rfc3339());

    if dry_run {
        println!("🔍 Dry run - would update: {}", settings_path.display());
        println!("Configuration preview:");
        println!("{}", serde_json::to_string_pretty(&settings).unwrap());
    } else {
        // Write updated settings
        let content = serde_json::to_string_pretty(&settings).map_err(|e| {
            HookClientError::claude_config(format!("Failed to serialize settings: {}", e))
        })?;

        std::fs::write(&settings_path, content).map_err(|e| {
            HookClientError::claude_config(format!(
                "Failed to write settings file {}: {}",
                settings_path.display(),
                e
            ))
        })?;

        info!("Updated Claude Code settings: {}", settings_path.display());
    }

    Ok(settings_path)
}

fn print_success_message(binary_path: &Path, settings_path: &Path, server_url: &str) {
    println!("✅ Claude Code hooks configured successfully!");
    println!();
    println!("📁 Configuration Details:");
    println!("   Binary: {}", binary_path.display());
    println!("   Settings: {}", settings_path.display());
    println!("   Server: {}", server_url);
    println!("   Version: {}", env!("CARGO_PKG_VERSION"));
    println!();
    println!("🚀 Next Steps:");
    println!("   1. Start the CCO-MCP server: cd cco-mcp && pnpm dev");
    println!("   2. Run Claude Code with hook support enabled");
    println!("   3. Monitor hook events in the CCO-MCP dashboard");
    println!();
    println!("🔧 Troubleshooting:");
    println!("   - Verify server is running: cco-hook-client --health-check");
    println!("   - Test configuration: cco-hook-client --dry-run");
    println!("   - Check logs for detailed information");
}

async fn uninstall_hooks(
    claude_dir: &Path,
    dry_run: bool,
    backup: bool,
    skip_confirmation: bool,
) -> Result<()> {
    println!("🗑️  CCO Hook Client Uninstallation");
    println!();

    let settings_path = claude_dir.join("settings.json");
    
    if !settings_path.exists() {
        println!("❌ No Claude Code settings found at: {}", settings_path.display());
        println!("💡 Nothing to uninstall");
        return Ok(());
    }

    // Read existing settings
    let content = std::fs::read_to_string(&settings_path).map_err(|e| {
        HookClientError::claude_config(format!(
            "Failed to read settings file {}: {}",
            settings_path.display(),
            e
        ))
    })?;
    
    let mut settings: Value = serde_json::from_str(&content).map_err(|e| {
        HookClientError::claude_config(format!(
            "Failed to parse settings file {}: {}",
            settings_path.display(),
            e
        ))
    })?;

    // Check if CCO hooks are configured
    let mut cco_hooks_found = false;
    let mut hook_event_types = Vec::new();
    
    if let Some(hooks) = settings.get("hooks").and_then(|h| h.as_object()) {
        for (event_type, hook_configs) in hooks {
            if let Some(configs) = hook_configs.as_array() {
                for config in configs {
                    if let Some(hooks_array) = config.get("hooks").and_then(|h| h.as_array()) {
                        for hook in hooks_array {
                            if let Some(command) = hook.get("command").and_then(|c| c.as_str()) {
                                if command.contains("cco-hook-client") {
                                    cco_hooks_found = true;
                                    hook_event_types.push(event_type.clone());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    if !cco_hooks_found {
        println!("ℹ️  No CCO hooks found in Claude Code settings");
        
        // Check for CCO metadata
        let has_cco_metadata = settings.get("cco_server_url").is_some() ||
                               settings.get("cco_hook_client_version").is_some() ||
                               settings.get("cco_configured_at").is_some();
        
        if has_cco_metadata {
            println!("🧹 Found CCO metadata in settings, will clean up");
        } else {
            println!("💡 Nothing to uninstall");
            return Ok(());
        }
    } else {
        println!("🔍 Found CCO hooks in the following event types:");
        for event_type in &hook_event_types {
            println!("   • {}", event_type);
        }
        println!();
    }
    
    // Show what will be removed
    println!("📋 The following will be removed from {}:", settings_path.display());
    println!("   • Hook configurations for CCO-MCP");
    println!("   • CCO metadata (server_url, version, configured_at)");
    
    // Check for available backups
    let mut latest_backup: Option<String> = None;
    if let Ok(entries) = std::fs::read_dir(claude_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with("settings.json.backup-") {
                    if latest_backup.is_none() || name > latest_backup.as_ref().unwrap().as_str() {
                        latest_backup = Some(name.to_string());
                    }
                }
            }
        }
    }
    
    if let Some(backup_name) = &latest_backup {
        println!("   💾 Latest backup available: {}", backup_name);
    }
    
    println!();
    
    // Confirmation prompt
    if !skip_confirmation && !dry_run {
        println!("❓ Are you sure you want to uninstall CCO hooks? [y/N]");
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).map_err(|e| {
            HookClientError::claude_config(format!("Failed to read input: {}", e))
        })?;
        
        let input = input.trim().to_lowercase();
        if input != "y" && input != "yes" {
            println!("❌ Uninstallation cancelled");
            return Ok(());
        }
    }
    
    // Create backup if requested
    if backup && settings_path.exists() && !dry_run {
        let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
        let backup_path = claude_dir.join(format!("settings.json.backup-{}", timestamp));
        std::fs::copy(&settings_path, &backup_path).map_err(|e| {
            HookClientError::claude_config(format!(
                "Failed to create backup {}: {}",
                backup_path.display(),
                e
            ))
        })?;
        println!("💾 Backup created: {}", backup_path.display());
    }
    
    if dry_run {
        println!("🔍 Dry run - would remove CCO hook configuration");
        println!("   • {} event types would be modified", hook_event_types.len());
        println!("   • CCO metadata would be removed");
        return Ok(());
    }
    
    // Remove CCO hooks and metadata
    let mut modified = false;
    
    // Remove hook configurations
    if let Some(hooks) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) {
        let hook_types = ["PreToolUse", "PostToolUse", "Notification", "Stop", "SubagentStop"];
        
        for hook_type in &hook_types {
            if let Some(hook_configs) = hooks.get_mut(*hook_type).and_then(|h| h.as_array_mut()) {
                hook_configs.retain(|config| {
                    if let Some(hooks_array) = config.get("hooks").and_then(|h| h.as_array()) {
                        for hook in hooks_array {
                            if let Some(command) = hook.get("command").and_then(|c| c.as_str()) {
                                if command.contains("cco-hook-client") {
                                    return false; // Remove this config
                                }
                            }
                        }
                    }
                    true // Keep this config
                });
                
                // Remove empty arrays
                if hook_configs.is_empty() {
                    hooks.remove(*hook_type);
                    modified = true;
                }
            }
        }
        
        // Remove empty hooks object
        if hooks.is_empty() {
            settings.as_object_mut().unwrap().remove("hooks");
            modified = true;
        }
    }
    
    // Remove CCO metadata
    let metadata_keys = ["cco_server_url", "cco_hook_client_version", "cco_configured_at"];
    if let Some(settings_obj) = settings.as_object_mut() {
        for key in &metadata_keys {
            if settings_obj.remove(*key).is_some() {
                modified = true;
            }
        }
    }
    
    if modified {
        // Write updated settings
        let content = serde_json::to_string_pretty(&settings).map_err(|e| {
            HookClientError::claude_config(format!("Failed to serialize settings: {}", e))
        })?;

        std::fs::write(&settings_path, content).map_err(|e| {
            HookClientError::claude_config(format!(
                "Failed to write settings file {}: {}",
                settings_path.display(),
                e
            ))
        })?;
        
        println!("✅ CCO hooks uninstalled successfully!");
        println!("📁 Updated settings: {}", settings_path.display());
        
        if let Some(backup_name) = latest_backup {
            println!("🔄 To restore previous configuration: cp {} {}", 
                     claude_dir.join(backup_name).display(),
                     settings_path.display());
        }
    } else {
        println!("ℹ️  No changes were needed");
    }
    
    println!();
    println!("🧹 Uninstallation complete!");
    println!("💡 You can reinstall at any time with: configure-claude");
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_expand_tilde() {
        // Test with tilde
        if let Ok(expanded) = expand_tilde("~/.claude") {
            assert!(expanded.to_string_lossy().contains(".claude"));
            assert!(!expanded.to_string_lossy().starts_with('~'));
        }

        // Test without tilde
        let result = expand_tilde("/absolute/path").unwrap();
        assert_eq!(result, PathBuf::from("/absolute/path"));
    }

    #[test]
    fn test_configure_claude_settings() {
        let temp_dir = TempDir::new().unwrap();
        let claude_dir = temp_dir.path();
        let binary_path = PathBuf::from("/usr/bin/cco-hook-client");
        let server_url = "http://localhost:8660";

        let result = configure_claude_settings(
            claude_dir,
            &binary_path,
            server_url,
            true, // dry_run
            false,
            false,
        );

        assert!(result.is_ok());
        
        let settings_path = result.unwrap();
        assert_eq!(settings_path, claude_dir.join("settings.json"));
    }
}