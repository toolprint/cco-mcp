use serde_json;
use std::io;
use tokio::io::{AsyncBufReadExt, BufReader, Lines, Stdin};
use tokio::sync::mpsc;
use tracing::{debug, error};

use crate::error::{HookClientError, Result};
use crate::events::{EventMetadata, HookEvent};

/// Async stdin reader for processing Claude Code hook events
pub struct StdinReader {
    lines: Lines<BufReader<Stdin>>,
}

impl StdinReader {
    /// Create a new stdin reader
    pub fn new() -> Self {
        let stdin = tokio::io::stdin();
        let buf_reader = BufReader::new(stdin);
        let lines = buf_reader.lines();

        debug!("Stdin reader initialized");
        
        Self { lines }
    }

    /// Read and parse the next hook event from stdin
    pub async fn read_event(&mut self) -> Result<Option<(HookEvent, EventMetadata)>> {
        loop {
            match self.lines.next_line().await {
                Ok(Some(line)) => {
                    let line = line.trim();
                    if line.is_empty() {
                        continue; // Skip empty lines
                    }

                    debug!(line_length = line.len(), "Received line from stdin");

                    match self.parse_event(line) {
                        Ok(event) => {
                            let metadata = EventMetadata::new();
                            debug!(
                                event_id = %metadata.id,
                                event_type = %event.event_type(),
                                session_id = event.session_id(),
                                tool_name = event.tool_name(),
                                "Successfully parsed hook event"
                            );
                            return Ok(Some((event, metadata)));
                        }
                        Err(e) => {
                            error!(
                                error = %e,
                                line = %line.chars().take(200).collect::<String>(), // First 200 chars
                                "Failed to parse hook event, skipping line"
                            );
                            // Continue reading instead of returning error
                            continue;
                        }
                    }
                }
                Ok(None) => {
                    debug!("Stdin closed (EOF)");
                    return Ok(None);
                }
                Err(e) => {
                    error!(error = %e, "Error reading from stdin");
                    return Err(HookClientError::Io { source: e });
                }
            }
        }
    }

    /// Parse a JSON line into a hook event
    fn parse_event(&self, line: &str) -> Result<HookEvent> {
        // First, try to parse as generic JSON to validate structure
        let _: serde_json::Value = serde_json::from_str(line).map_err(|e| {
            debug!(
                error = %e,
                line_preview = %line.chars().take(100).collect::<String>(),
                "JSON parsing failed"
            );
            HookClientError::JsonParse { source: e }
        })?;

        // Then parse as a specific hook event
        let event: HookEvent = serde_json::from_str(line).map_err(|e| {
            debug!(
                error = %e,
                line_preview = %line.chars().take(100).collect::<String>(),
                "Hook event parsing failed"
            );
            HookClientError::invalid_event(format!("Invalid hook event format: {}", e))
        })?;

        // Validate the event
        event.validate()?;

        Ok(event)
    }
}

impl Default for StdinReader {
    fn default() -> Self {
        Self::new()
    }
}

/// Async stream-based stdin processor for high-throughput scenarios
pub struct StdinProcessor {
    receiver: mpsc::Receiver<ProcessorMessage>,
    _handle: tokio::task::JoinHandle<()>,
}

enum ProcessorMessage {
    Event(HookEvent, EventMetadata),
    Error(HookClientError),
    Eof,
}

impl StdinProcessor {
    /// Create a new stdin processor with buffering
    pub fn new(buffer_size: usize) -> Self {
        let (tx, rx) = mpsc::channel(buffer_size);
        
        let handle = tokio::spawn(async move {
            let mut reader = StdinReader::new();
            
            loop {
                match reader.read_event().await {
                    Ok(Some((event, metadata))) => {
                        if tx.send(ProcessorMessage::Event(event, metadata)).await.is_err() {
                            debug!("Receiver dropped, stopping stdin processor");
                            break;
                        }
                    }
                    Ok(None) => {
                        let _ = tx.send(ProcessorMessage::Eof).await;
                        break;
                    }
                    Err(e) => {
                        if tx.send(ProcessorMessage::Error(e)).await.is_err() {
                            debug!("Receiver dropped, stopping stdin processor");
                            break;
                        }
                    }
                }
            }
        });

        Self {
            receiver: rx,
            _handle: handle,
        }
    }

    /// Get the next processed event
    pub async fn next_event(&mut self) -> Result<Option<(HookEvent, EventMetadata)>> {
        match self.receiver.recv().await {
            Some(ProcessorMessage::Event(event, metadata)) => Ok(Some((event, metadata))),
            Some(ProcessorMessage::Error(e)) => Err(e),
            Some(ProcessorMessage::Eof) => Ok(None),
            None => Ok(None), // Channel closed
        }
    }
}

/// Helper function to detect if we're running in a pipe vs TTY
pub fn is_piped_input() -> bool {
    use std::io::IsTerminal;
    !io::stdin().is_terminal()
}

/// Helper function to validate JSON line format
pub fn validate_json_line(line: &str) -> Result<()> {
    if line.trim().is_empty() {
        return Err(HookClientError::invalid_event("Empty line"));
    }

    // Check for common JSON structure issues
    let trimmed = line.trim();
    if !trimmed.starts_with('{') || !trimmed.ends_with('}') {
        return Err(HookClientError::invalid_event(
            "Line must be a JSON object (start with { and end with })"
        ));
    }

    // Validate as JSON
    serde_json::from_str::<serde_json::Value>(trimmed)
        .map_err(|e| HookClientError::invalid_event(format!("Invalid JSON: {}", e)))?;

    Ok(())
}

/// Statistics for stdin processing
#[derive(Debug, Default, Clone)]
pub struct StdinStats {
    pub lines_read: u64,
    pub events_parsed: u64,
    pub parse_errors: u64,
    pub validation_errors: u64,
    pub last_event_timestamp: Option<chrono::DateTime<chrono::Utc>>,
}

impl StdinStats {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn increment_lines_read(&mut self) {
        self.lines_read += 1;
    }

    pub fn increment_events_parsed(&mut self) {
        self.events_parsed += 1;
        self.last_event_timestamp = Some(chrono::Utc::now());
    }

    pub fn increment_parse_errors(&mut self) {
        self.parse_errors += 1;
    }

    pub fn increment_validation_errors(&mut self) {
        self.validation_errors += 1;
    }

    pub fn success_rate(&self) -> f64 {
        if self.lines_read == 0 {
            0.0
        } else {
            (self.events_parsed as f64) / (self.lines_read as f64)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::*;
    use std::collections::HashMap;

    #[test]
    fn test_validate_json_line() {
        // Valid JSON
        assert!(validate_json_line(r#"{"type": "test"}"#).is_ok());
        
        // Empty line
        assert!(validate_json_line("").is_err());
        assert!(validate_json_line("   ").is_err());
        
        // Invalid JSON structure
        assert!(validate_json_line(r#"not json"#).is_err());
        assert!(validate_json_line(r#"{"incomplete"#).is_err());
        
        // Array instead of object
        assert!(validate_json_line(r#"["array"]"#).is_err());
    }

    #[test]
    fn test_event_parsing() {
        let reader = StdinReader::new();
        
        // Valid PreToolUse event
        let json_line = r#"{"type":"PreToolUse","sessionId":"test","timestamp":"2024-01-01T00:00:00Z","tool":{"name":"TestTool","input":{}}}"#;
        let result = reader.parse_event(json_line);
        assert!(result.is_ok());
        
        let event = result.unwrap();
        assert_eq!(event.event_type(), HookEventType::PreToolUse);
        assert_eq!(event.session_id(), "test");
        assert_eq!(event.tool_name(), Some("TestTool"));
    }

    #[test]
    fn test_event_validation() {
        let reader = StdinReader::new();
        
        // Invalid event - empty session ID
        let json_line = r#"{"type":"PreToolUse","sessionId":"","timestamp":"2024-01-01T00:00:00Z","tool":{"name":"TestTool","input":{}}}"#;
        let result = reader.parse_event(json_line);
        assert!(result.is_err());
        
        // Invalid event - empty tool name
        let json_line = r#"{"type":"PreToolUse","sessionId":"test","timestamp":"2024-01-01T00:00:00Z","tool":{"name":"","input":{}}}"#;
        let result = reader.parse_event(json_line);
        assert!(result.is_err());
    }

    #[test]
    fn test_is_piped_input() {
        // This test will depend on how the test is run
        // In CI/automation, it's usually piped, in manual runs it's not
        let is_piped = is_piped_input();
        println!("Input is piped: {}", is_piped);
        // Just ensure it doesn't panic
    }

    #[test]
    fn test_stdin_stats() {
        let mut stats = StdinStats::new();
        assert_eq!(stats.lines_read, 0);
        assert_eq!(stats.events_parsed, 0);
        assert_eq!(stats.success_rate(), 0.0);
        
        stats.increment_lines_read();
        stats.increment_events_parsed();
        assert_eq!(stats.success_rate(), 1.0);
        
        stats.increment_lines_read();
        stats.increment_parse_errors();
        assert_eq!(stats.success_rate(), 0.5);
    }

    // Integration test that would need actual stdin input
    #[tokio::test]
    async fn test_stdin_processor_creation() {
        // Just test that we can create a processor without errors
        let _processor = StdinProcessor::new(10);
        // The processor runs in the background, so we don't test actual input here
    }
}