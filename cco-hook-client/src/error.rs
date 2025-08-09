use thiserror::Error;

/// CCO Hook Client error types
#[derive(Error, Debug)]
pub enum HookClientError {
    #[error("Configuration error: {message}")]
    Config { message: String },

    #[error("Network error: {source}")]
    Network {
        #[from]
        source: reqwest::Error,
    },

    #[error("JSON parsing error: {source}")]
    JsonParse {
        #[from]
        source: serde_json::Error,
    },

    #[error("IO error: {source}")]
    Io {
        #[from]
        source: std::io::Error,
    },

    #[error("Invalid hook event: {message}")]
    InvalidEvent { message: String },

    #[error("Server communication failed after {attempts} attempts: {last_error}")]
    ServerCommunication {
        attempts: usize,
        last_error: String,
    },

    #[error("HTTP error {status}: {message}")]
    HttpError { status: u16, message: String },

    #[error("Timeout after {timeout_ms}ms: {context}")]
    Timeout { timeout_ms: u64, context: String },

    #[error("Invalid URL: {url}")]
    InvalidUrl { url: String },

    #[error("Signal handling error: {message}")]
    SignalHandling { message: String },

    #[error("Claude Code configuration error: {message}")]
    ClaudeConfig { message: String },

    #[error("Blocking error (tool execution denied): {message}")]
    BlockingError { message: String },
}

impl HookClientError {
    pub fn config<S: Into<String>>(message: S) -> Self {
        Self::Config {
            message: message.into(),
        }
    }

    pub fn invalid_event<S: Into<String>>(message: S) -> Self {
        Self::InvalidEvent {
            message: message.into(),
        }
    }

    pub fn server_communication(attempts: usize, last_error: String) -> Self {
        Self::ServerCommunication {
            attempts,
            last_error,
        }
    }

    pub fn http_error(status: u16, message: String) -> Self {
        Self::HttpError { status, message }
    }

    pub fn timeout(timeout_ms: u64, context: String) -> Self {
        Self::Timeout {
            timeout_ms,
            context,
        }
    }

    pub fn invalid_url<S: Into<String>>(url: S) -> Self {
        Self::InvalidUrl { url: url.into() }
    }

    pub fn signal_handling<S: Into<String>>(message: S) -> Self {
        Self::SignalHandling {
            message: message.into(),
        }
    }

    pub fn claude_config<S: Into<String>>(message: S) -> Self {
        Self::ClaudeConfig {
            message: message.into(),
        }
    }

    pub fn blocking_error<S: Into<String>>(message: S) -> Self {
        Self::BlockingError {
            message: message.into(),
        }
    }

    /// Returns true if this error is retryable
    pub fn is_retryable(&self) -> bool {
        match self {
            // Network errors are generally retryable
            Self::Network { source } => {
                // Don't retry on client errors (4xx), but retry on server errors (5xx) and network issues
                !source.is_decode() && !source.is_builder()
            }
            // HTTP 5xx errors are retryable, 4xx are not
            Self::HttpError { status, .. } => *status >= 500,
            // Timeouts are retryable
            Self::Timeout { .. } => true,
            // Other errors are generally not retryable
            _ => false,
        }
    }

    /// Returns true if this is a client error (user's fault)
    pub fn is_client_error(&self) -> bool {
        matches!(
            self,
            Self::Config { .. }
                | Self::InvalidEvent { .. }
                | Self::JsonParse { .. }
                | Self::InvalidUrl { .. }
                | Self::ClaudeConfig { .. }
        )
    }

    /// Returns true if this is a server error (server's fault)
    pub fn is_server_error(&self) -> bool {
        match self {
            Self::HttpError { status, .. } => *status >= 500,
            Self::Network { .. } | Self::Timeout { .. } | Self::ServerCommunication { .. } => true,
            _ => false,
        }
    }

    /// Returns true if this is a blocking error (should exit with code 2)
    pub fn is_blocking_error(&self) -> bool {
        matches!(self, Self::BlockingError { .. })
    }
}

/// Result type alias for convenience
pub type Result<T> = std::result::Result<T, HookClientError>;

/// Convert from reqwest errors with additional context (manual implementation to avoid conflict)
pub fn convert_reqwest_error(err: reqwest::Error) -> HookClientError {
    if err.is_timeout() {
        HookClientError::Timeout {
            timeout_ms: 0, // Unknown timeout duration
            context: "HTTP request timeout".to_string(),
        }
    } else if let Some(status) = err.status() {
        HookClientError::HttpError {
            status: status.as_u16(),
            message: err.to_string(),
        }
    } else {
        HookClientError::Network { source: err }
    }
}

/// Convert from URL parse errors
impl From<url::ParseError> for HookClientError {
    fn from(err: url::ParseError) -> Self {
        Self::InvalidUrl {
            url: format!("Parse error: {}", err),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_retryability() {
        let timeout_err = HookClientError::timeout(5000, "test".to_string());
        assert!(timeout_err.is_retryable());

        let http_500_err = HookClientError::http_error(500, "Internal Server Error".to_string());
        assert!(http_500_err.is_retryable());

        let http_400_err = HookClientError::http_error(400, "Bad Request".to_string());
        assert!(!http_400_err.is_retryable());

        let config_err = HookClientError::config("test".to_string());
        assert!(!config_err.is_retryable());
    }

    #[test]
    fn test_error_classification() {
        let config_err = HookClientError::config("test".to_string());
        assert!(config_err.is_client_error());
        assert!(!config_err.is_server_error());

        let http_500_err = HookClientError::http_error(500, "Internal Server Error".to_string());
        assert!(!http_500_err.is_client_error());
        assert!(http_500_err.is_server_error());
    }

    #[test]
    fn test_blocking_error() {
        let blocking_err = HookClientError::blocking_error("Tool execution denied");
        assert!(blocking_err.is_blocking_error());
        assert!(!blocking_err.is_client_error());
        assert!(!blocking_err.is_server_error());

        let other_err = HookClientError::config("test");
        assert!(!other_err.is_blocking_error());
    }
}