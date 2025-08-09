use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use url::Url;

use crate::error::{HookClientError, Result};

/// Main configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub server: ServerConfig,
    pub client: ClientConfig,
    pub logging: LoggingConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            client: ClientConfig::default(),
            logging: LoggingConfig::default(),
        }
    }
}

/// Server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub protocol: String,
    pub timeout_ms: u64,
    pub base_path: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "localhost".to_string(),
            port: 8660,
            protocol: "http".to_string(),
            timeout_ms: 10000,
            base_path: "/api/hooks".to_string(),
        }
    }
}

impl ServerConfig {
    /// Build the full server URL
    pub fn url(&self) -> Result<Url> {
        let url_str = format!("{}://{}:{}{}", self.protocol, self.host, self.port, self.base_path);
        Url::parse(&url_str).map_err(|_| HookClientError::invalid_url(&url_str))
    }

    /// Get the event endpoint URL
    pub fn event_url(&self) -> Result<Url> {
        let mut url = self.url()?;
        url.set_path(&format!("{}/event", self.base_path));
        Ok(url)
    }

    /// Get request timeout as Duration
    pub fn timeout(&self) -> Duration {
        Duration::from_millis(self.timeout_ms)
    }
}

/// HTTP client configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientConfig {
    pub max_retries: usize,
    pub initial_backoff_ms: u64,
    pub max_backoff_ms: u64,
    pub connection_timeout_ms: u64,
    pub keep_alive: bool,
    pub pool_max_idle_per_host: usize,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_backoff_ms: 100,
            max_backoff_ms: 5000,
            connection_timeout_ms: 5000,
            keep_alive: true,
            pool_max_idle_per_host: 10,
        }
    }
}

impl ClientConfig {
    /// Get initial backoff duration
    pub fn initial_backoff(&self) -> Duration {
        Duration::from_millis(self.initial_backoff_ms)
    }

    /// Get max backoff duration
    pub fn max_backoff(&self) -> Duration {
        Duration::from_millis(self.max_backoff_ms)
    }

    /// Get connection timeout duration
    pub fn connection_timeout(&self) -> Duration {
        Duration::from_millis(self.connection_timeout_ms)
    }
}

/// Logging configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub format: LogFormat,
    pub file_path: Option<PathBuf>,
    pub max_file_size_mb: Option<u64>,
    pub max_files: Option<u32>,
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: "info".to_string(),
            format: LogFormat::Pretty,
            file_path: None,
            max_file_size_mb: Some(10),
            max_files: Some(5),
        }
    }
}

/// Log output format
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogFormat {
    Pretty,
    Json,
    Compact,
}

impl std::fmt::Display for LogFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pretty => write!(f, "pretty"),
            Self::Json => write!(f, "json"),
            Self::Compact => write!(f, "compact"),
        }
    }
}

impl std::str::FromStr for LogFormat {
    type Err = HookClientError;

    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "pretty" => Ok(Self::Pretty),
            "json" => Ok(Self::Json),
            "compact" => Ok(Self::Compact),
            _ => Err(HookClientError::config(format!("Invalid log format: {}", s))),
        }
    }
}

/// Configuration builder for loading from various sources
pub struct ConfigBuilder {
    config: Config,
}

impl ConfigBuilder {
    /// Create a new builder with default configuration
    pub fn new() -> Self {
        Self {
            config: Config::default(),
        }
    }

    /// Load configuration from a TOML file
    pub fn from_file<P: AsRef<Path>>(mut self, path: P) -> Result<Self> {
        let path = path.as_ref();
        
        if !path.exists() {
            tracing::debug!("Config file does not exist: {}", path.display());
            return Ok(self);
        }

        let content = std::fs::read_to_string(path)
            .map_err(|e| HookClientError::config(format!("Failed to read config file {}: {}", path.display(), e)))?;
        
        let file_config: Config = toml::from_str(&content)
            .map_err(|e| HookClientError::config(format!("Failed to parse config file {}: {}", path.display(), e)))?;
        
        // Merge file config into default config
        self.config = file_config;
        
        tracing::debug!("Loaded configuration from: {}", path.display());
        Ok(self)
    }

    /// Apply environment variable overrides
    pub fn from_env(mut self) -> Result<Self> {
        // Server configuration
        if let Ok(host) = std::env::var("CCO_SERVER_HOST") {
            self.config.server.host = host;
        }
        
        if let Ok(port) = std::env::var("CCO_SERVER_PORT") {
            self.config.server.port = port.parse()
                .map_err(|e| HookClientError::config(format!("Invalid CCO_SERVER_PORT: {}", e)))?;
        }
        
        if let Ok(protocol) = std::env::var("CCO_SERVER_PROTOCOL") {
            self.config.server.protocol = protocol;
        }
        
        if let Ok(timeout) = std::env::var("CCO_SERVER_TIMEOUT_MS") {
            self.config.server.timeout_ms = timeout.parse()
                .map_err(|e| HookClientError::config(format!("Invalid CCO_SERVER_TIMEOUT_MS: {}", e)))?;
        }
        
        if let Ok(base_path) = std::env::var("CCO_SERVER_BASE_PATH") {
            self.config.server.base_path = base_path;
        }

        // Client configuration
        if let Ok(max_retries) = std::env::var("CCO_CLIENT_MAX_RETRIES") {
            self.config.client.max_retries = max_retries.parse()
                .map_err(|e| HookClientError::config(format!("Invalid CCO_CLIENT_MAX_RETRIES: {}", e)))?;
        }
        
        if let Ok(initial_backoff) = std::env::var("CCO_CLIENT_INITIAL_BACKOFF_MS") {
            self.config.client.initial_backoff_ms = initial_backoff.parse()
                .map_err(|e| HookClientError::config(format!("Invalid CCO_CLIENT_INITIAL_BACKOFF_MS: {}", e)))?;
        }
        
        if let Ok(max_backoff) = std::env::var("CCO_CLIENT_MAX_BACKOFF_MS") {
            self.config.client.max_backoff_ms = max_backoff.parse()
                .map_err(|e| HookClientError::config(format!("Invalid CCO_CLIENT_MAX_BACKOFF_MS: {}", e)))?;
        }
        
        if let Ok(connection_timeout) = std::env::var("CCO_CLIENT_CONNECTION_TIMEOUT_MS") {
            self.config.client.connection_timeout_ms = connection_timeout.parse()
                .map_err(|e| HookClientError::config(format!("Invalid CCO_CLIENT_CONNECTION_TIMEOUT_MS: {}", e)))?;
        }

        // Logging configuration
        if let Ok(level) = std::env::var("CCO_LOG_LEVEL") {
            self.config.logging.level = level;
        }
        
        if let Ok(format) = std::env::var("CCO_LOG_FORMAT") {
            self.config.logging.format = format.parse()?;
        }
        
        if let Ok(file_path) = std::env::var("CCO_LOG_FILE") {
            self.config.logging.file_path = Some(PathBuf::from(file_path));
        }

        tracing::debug!("Applied environment variable overrides");
        Ok(self)
    }

    /// Build the final configuration
    pub fn build(self) -> Result<Config> {
        // Validate the configuration
        self.validate()?;
        Ok(self.config)
    }

    /// Validate the configuration
    fn validate(&self) -> Result<()> {
        // Validate server config
        if self.config.server.host.trim().is_empty() {
            return Err(HookClientError::config("Server host cannot be empty"));
        }
        
        if self.config.server.port == 0 {
            return Err(HookClientError::config("Server port cannot be 0"));
        }
        
        if !matches!(self.config.server.protocol.as_str(), "http" | "https") {
            return Err(HookClientError::config("Server protocol must be 'http' or 'https'"));
        }
        
        // Try to build the URL to validate it
        self.config.server.url()?;

        // Validate client config
        if self.config.client.max_retries > 100 {
            return Err(HookClientError::config("Max retries cannot exceed 100"));
        }
        
        if self.config.client.initial_backoff_ms == 0 {
            return Err(HookClientError::config("Initial backoff cannot be 0"));
        }
        
        if self.config.client.max_backoff_ms < self.config.client.initial_backoff_ms {
            return Err(HookClientError::config("Max backoff must be >= initial backoff"));
        }

        // Validate logging config
        if !matches!(self.config.logging.level.to_lowercase().as_str(), "trace" | "debug" | "info" | "warn" | "error") {
            return Err(HookClientError::config(format!("Invalid log level: {}", self.config.logging.level)));
        }

        tracing::debug!("Configuration validation passed");
        Ok(())
    }
}

impl Default for ConfigBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Load configuration from default locations with environment overrides
pub fn load_config() -> Result<Config> {
    let mut builder = ConfigBuilder::new();

    // Try to load from user config directory
    if let Some(config_dir) = dirs::config_dir() {
        let config_path = config_dir.join("cco-hook-client").join("config.toml");
        builder = builder.from_file(config_path)?;
    }

    // Try to load from current directory
    builder = builder.from_file("cco-hook-client.toml")?;

    // Apply environment variables
    builder = builder.from_env()?;

    builder.build()
}

/// Generate a default configuration file
pub fn generate_default_config() -> Result<String> {
    let config = Config::default();
    toml::to_string_pretty(&config)
        .map_err(|e| HookClientError::config(format!("Failed to serialize default config: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use std::io::Write;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.server.host, "localhost");
        assert_eq!(config.server.port, 8660);
        assert_eq!(config.server.protocol, "http");
        assert_eq!(config.client.max_retries, 3);
        assert_eq!(config.logging.level, "info");
    }

    #[test]
    fn test_server_url_building() {
        let config = ServerConfig::default();
        let url = config.url().unwrap();
        assert_eq!(url.as_str(), "http://localhost:8660/api/hooks");
        
        let event_url = config.event_url().unwrap();
        assert_eq!(event_url.as_str(), "http://localhost:8660/api/hooks/event");
    }

    #[test]
    fn test_config_from_file() {
        let config_content = r#"
[server]
host = "example.com"
port = 9000
protocol = "https"

[client]
max_retries = 5

[logging]
level = "debug"
format = "json"
"#;

        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "{}", config_content).unwrap();

        let config = ConfigBuilder::new()
            .from_file(temp_file.path())
            .unwrap()
            .build()
            .unwrap();

        assert_eq!(config.server.host, "example.com");
        assert_eq!(config.server.port, 9000);
        assert_eq!(config.server.protocol, "https");
        assert_eq!(config.client.max_retries, 5);
        assert_eq!(config.logging.level, "debug");
        assert_eq!(config.logging.format, LogFormat::Json);
    }

    #[test]
    fn test_env_overrides() {
        std::env::set_var("CCO_SERVER_HOST", "test.example.com");
        std::env::set_var("CCO_SERVER_PORT", "9999");
        std::env::set_var("CCO_LOG_LEVEL", "trace");

        let config = ConfigBuilder::new()
            .from_env()
            .unwrap()
            .build()
            .unwrap();

        assert_eq!(config.server.host, "test.example.com");
        assert_eq!(config.server.port, 9999);
        assert_eq!(config.logging.level, "trace");

        // Cleanup
        std::env::remove_var("CCO_SERVER_HOST");
        std::env::remove_var("CCO_SERVER_PORT");
        std::env::remove_var("CCO_LOG_LEVEL");
    }

    #[test]
    fn test_config_validation() {
        let mut config = Config::default();
        
        // Valid config should pass
        let builder = ConfigBuilder { config: config.clone() };
        assert!(builder.validate().is_ok());
        
        // Invalid host should fail
        config.server.host = "".to_string();
        let builder = ConfigBuilder { config: config.clone() };
        assert!(builder.validate().is_err());
        
        // Invalid port should fail
        config.server.host = "localhost".to_string();
        config.server.port = 0;
        let builder = ConfigBuilder { config };
        assert!(builder.validate().is_err());
    }
}