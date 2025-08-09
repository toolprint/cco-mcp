use std::path::Path;
use tracing::Level;
use tracing_appender::non_blocking::{NonBlocking, WorkerGuard};
use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter, Registry,
};

use crate::config::{LogFormat, LoggingConfig};
use crate::error::{HookClientError, Result};

/// Initialize logging based on configuration
pub fn init_logging(config: &LoggingConfig) -> Result<Option<WorkerGuard>> {
    let level = parse_log_level(&config.level)?;
    
    // Create filter from level and environment
    let env_filter = EnvFilter::builder()
        .with_default_directive(level.into())
        .from_env_lossy()
        .add_directive("reqwest=warn".parse().unwrap()) // Reduce reqwest noise
        .add_directive("hyper=warn".parse().unwrap())   // Reduce hyper noise
        .add_directive("h2=warn".parse().unwrap());     // Reduce h2 noise

    let registry = Registry::default().with(env_filter);

    // File logging setup if path is specified
    let (file_writer, guard) = if let Some(ref file_path) = config.file_path {
        setup_file_logging(file_path, config)?
    } else {
        (None, None)
    };

    match (file_writer, config.format) {
        // File logging with specified format
        (Some(file_writer), LogFormat::Json) => {
            let file_layer = fmt::Layer::new()
                .json()
                .with_writer(file_writer)
                .with_span_events(FmtSpan::CLOSE);

            let stdout_layer = fmt::Layer::new()
                .with_writer(std::io::stderr) // Use stderr to avoid interference with stdout
                .with_span_events(FmtSpan::CLOSE);

            let _ = registry
                .with(file_layer)
                .with(stdout_layer)
                .try_init();
        }
        (Some(file_writer), LogFormat::Pretty) => {
            let file_layer = fmt::Layer::new()
                .pretty()
                .with_writer(file_writer)
                .with_span_events(FmtSpan::CLOSE);

            let stdout_layer = fmt::Layer::new()
                .with_writer(std::io::stderr)
                .with_span_events(FmtSpan::CLOSE);

            let _ = registry
                .with(file_layer)
                .with(stdout_layer)
                .try_init();
        }
        (Some(file_writer), LogFormat::Compact) => {
            let file_layer = fmt::Layer::new()
                .compact()
                .with_writer(file_writer)
                .with_span_events(FmtSpan::CLOSE);

            let stdout_layer = fmt::Layer::new()
                .compact()
                .with_writer(std::io::stderr)
                .with_span_events(FmtSpan::CLOSE);

            let _ = registry
                .with(file_layer)
                .with(stdout_layer)
                .try_init();
        }
        // Console-only logging
        (None, LogFormat::Json) => {
            let layer = fmt::Layer::new()
                .json()
                .with_writer(std::io::stderr)
                .with_span_events(FmtSpan::CLOSE);

            let _ = registry.with(layer).try_init();
        }
        (None, LogFormat::Pretty) => {
            let layer = fmt::Layer::new()
                .pretty()
                .with_writer(std::io::stderr)
                .with_span_events(FmtSpan::CLOSE);

            let _ = registry.with(layer).try_init();
        }
        (None, LogFormat::Compact) => {
            let layer = fmt::Layer::new()
                .compact()
                .with_writer(std::io::stderr)
                .with_span_events(FmtSpan::CLOSE);

            let _ = registry.with(layer).try_init();
        }
    }

    tracing::info!(
        level = %level,
        format = %config.format,
        file_path = config.file_path.as_ref().map(|p| p.to_string_lossy().to_string()),
        "Logging initialized"
    );

    Ok(guard)
}

/// Parse log level string into tracing Level
fn parse_log_level(level: &str) -> Result<Level> {
    match level.to_lowercase().as_str() {
        "trace" => Ok(Level::TRACE),
        "debug" => Ok(Level::DEBUG),
        "info" => Ok(Level::INFO),
        "warn" | "warning" => Ok(Level::WARN),
        "error" => Ok(Level::ERROR),
        _ => Err(HookClientError::config(format!("Invalid log level: {}", level))),
    }
}

/// Setup file logging with rotation
fn setup_file_logging(
    file_path: &Path,
    config: &LoggingConfig,
) -> Result<(Option<NonBlocking>, Option<WorkerGuard>)> {
    // Create parent directory if it doesn't exist
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            HookClientError::config(format!(
                "Failed to create log directory {}: {}",
                parent.display(),
                e
            ))
        })?;
    }

    // Setup file appender with rotation
    let file_appender = if let (Some(_max_size_mb), Some(max_files)) = (config.max_file_size_mb, config.max_files) {
        tracing_appender::rolling::Builder::new()
            .filename_prefix(
                file_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("cco-hook-client")
            )
            .filename_suffix("log")
            .max_log_files(max_files as usize)
            .build(
                file_path.parent().unwrap_or_else(|| Path::new(".")),
            )
            .map_err(|e| {
                HookClientError::config(format!("Failed to create rotating file appender: {}", e))
            })?
    } else {
        // Simple daily rotation if no size limits specified
        tracing_appender::rolling::daily(
            file_path.parent().unwrap_or_else(|| Path::new(".")),
            file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("cco-hook-client")
        )
    };

    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
    Ok((Some(non_blocking), Some(guard)))
}

/// Initialize minimal logging for early startup
pub fn init_minimal_logging() -> Result<()> {
    let env_filter = EnvFilter::builder()
        .with_default_directive(Level::WARN.into())
        .from_env_lossy();

    let result = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_writer(std::io::stderr)
        .compact()
        .try_init();

    match result {
        Ok(()) => Ok(()),
        Err(_) => {
            // Already initialized, which is fine
            Ok(())
        }
    }
}

/// Create a logging span for event processing
#[macro_export]
macro_rules! event_span {
    ($event:expr, $metadata:expr) => {
        tracing::span!(
            tracing::Level::DEBUG,
            "event_processing",
            event_id = %$metadata.id,
            event_type = %$event.event_type(),
            session_id = $event.session_id(),
            tool_name = $event.tool_name(),
            timestamp = %chrono::Utc::now().to_rfc3339(),
        )
    };
}

/// Create a logging span for HTTP requests
#[macro_export]
macro_rules! http_span {
    ($event_id:expr, $attempt:expr) => {
        tracing::span!(
            tracing::Level::DEBUG,
            "http_request",
            event_id = %$event_id,
            attempt = $attempt,
        )
    };
}

/// Structured logging macros for consistent log formatting

#[macro_export]
macro_rules! log_event_received {
    ($event:expr, $metadata:expr) => {
        tracing::info!(
            event_id = %$metadata.id,
            event_type = %$event.event_type(),
            session_id = $event.session_id(),
            tool_name = $event.tool_name(),
            requires_response = $event.requires_response(),
            "Hook event received and validated"
        );
    };
}

#[macro_export]
macro_rules! log_blocking_response {
    ($event_id:expr, $response:expr, $processing_time:expr) => {
        match $response.behavior.as_str() {
            "allow" => {
                tracing::info!(
                    event_id = %$event_id,
                    behavior = "allow",
                    message = %$response.message,
                    processing_time_ms = $processing_time,
                    "Tool execution allowed"
                );
            }
            "deny" => {
                tracing::warn!(
                    event_id = %$event_id,
                    behavior = "deny",
                    message = %$response.message,
                    processing_time_ms = $processing_time,
                    "Tool execution denied"
                );
            }
            _ => {
                tracing::warn!(
                    event_id = %$event_id,
                    behavior = %$response.behavior,
                    message = %$response.message,
                    processing_time_ms = $processing_time,
                    "Unknown blocking behavior"
                );
            }
        }
    };
}

#[macro_export]
macro_rules! log_startup_info {
    ($config:expr) => {
        tracing::info!(
            version = env!("CARGO_PKG_VERSION"),
            server_url = %$config.server.url().unwrap_or_else(|_| "invalid".parse().unwrap()),
            max_retries = $config.client.max_retries,
            timeout_ms = $config.server.timeout_ms,
            log_level = %$config.logging.level,
            "CCO Hook Client starting"
        );
    };
}

/// Performance logging utilities
pub struct PerformanceTimer {
    start: std::time::Instant,
    name: String,
}

impl PerformanceTimer {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            start: std::time::Instant::now(),
            name: name.into(),
        }
    }

    pub fn elapsed_ms(&self) -> u64 {
        self.start.elapsed().as_millis() as u64
    }
}

impl Drop for PerformanceTimer {
    fn drop(&mut self) {
        let elapsed = self.elapsed_ms();
        if elapsed > 1000 {
            tracing::warn!(
                operation = %self.name,
                duration_ms = elapsed,
                "Slow operation detected"
            );
        } else {
            tracing::debug!(
                operation = %self.name,
                duration_ms = elapsed,
                "Operation completed"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_parse_log_level() {
        assert_eq!(parse_log_level("trace").unwrap(), Level::TRACE);
        assert_eq!(parse_log_level("DEBUG").unwrap(), Level::DEBUG);
        assert_eq!(parse_log_level("Info").unwrap(), Level::INFO);
        assert_eq!(parse_log_level("warn").unwrap(), Level::WARN);
        assert_eq!(parse_log_level("warning").unwrap(), Level::WARN);
        assert_eq!(parse_log_level("error").unwrap(), Level::ERROR);
        
        assert!(parse_log_level("invalid").is_err());
    }

    #[test]
    fn test_minimal_logging_init() {
        // This should not panic
        let result = init_minimal_logging();
        // We can't easily test the actual logging output in unit tests,
        // but we can ensure initialization succeeds
        assert!(result.is_ok());
    }

    #[test]
    fn test_performance_timer() {
        let timer = PerformanceTimer::new("test_operation");
        std::thread::sleep(std::time::Duration::from_millis(1));
        let elapsed = timer.elapsed_ms();
        assert!(elapsed >= 1);
    }

    #[test]
    fn test_logging_config_validation() {
        let mut config = LoggingConfig::default();
        
        // Valid config should work
        assert!(parse_log_level(&config.level).is_ok());
        
        // Invalid level should fail
        config.level = "invalid".to_string();
        assert!(parse_log_level(&config.level).is_err());
    }
}