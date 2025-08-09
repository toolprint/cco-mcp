//! CCO Hook Client Library
//! 
//! High-performance Rust-based hook client for CCO-MCP (Claude Code Oversight).
//! This library provides all the core functionality for processing Claude Code
//! hook events and communicating with CCO-MCP servers.

pub mod client;
pub mod config;
pub mod error;
pub mod events;
pub mod logging;
pub mod stdin;

// Re-export commonly used types
pub use client::{HttpClient, ClientStats};
pub use config::{Config, ServerConfig, ClientConfig, LoggingConfig, load_config};
pub use error::{HookClientError, Result};
pub use events::{
    HookEvent, BlockingResponse, EventMetadata
};
pub use stdin::{StdinReader, StdinProcessor, StdinStats, is_piped_input};

/// Current version of the cco-hook-client
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// User agent string for HTTP requests
pub const USER_AGENT: &str = concat!(
    "cco-hook-client/",
    env!("CARGO_PKG_VERSION"),
    " (",
    env!("CARGO_PKG_REPOSITORY"),
    ")"
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_is_set() {
        assert!(!VERSION.is_empty());
    }

    #[test]
    fn test_user_agent_format() {
        assert!(USER_AGENT.starts_with("cco-hook-client/"));
        assert!(USER_AGENT.contains("github.com"));
    }
}