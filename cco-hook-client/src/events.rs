use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{HookClientError, Result};

/// Claude Code's official hook event format
/// This matches exactly what Claude Code sends via hooks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookEvent {
    pub session_id: String,
    pub transcript_path: String,
    pub cwd: String,
    pub hook_event_name: String,
    
    // Tool-related fields (for PreToolUse, PostToolUse)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_response: Option<serde_json::Value>,
    
    // Notification fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    
    // Stop/SubagentStop fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_hook_active: Option<bool>,
    
    // UserPromptSubmit fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    
    // PreCompact fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trigger: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_instructions: Option<String>,
    
    // SessionStart fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

impl HookEvent {
    /// Get the event type from hook_event_name
    pub fn event_type(&self) -> &str {
        &self.hook_event_name
    }
    
    /// Get session ID
    pub fn session_id(&self) -> &str {
        &self.session_id
    }
    
    /// Get tool name if this is a tool event
    pub fn tool_name(&self) -> Option<&str> {
        self.tool_name.as_deref()
    }
    
    /// Check if this event requires a blocking response (PreToolUse)
    pub fn requires_response(&self) -> bool {
        self.hook_event_name == "PreToolUse"
    }
    
    /// Validate the event has required fields for its type
    pub fn validate(&self) -> Result<()> {
        match self.hook_event_name.as_str() {
            "PreToolUse" => {
                if self.tool_name.is_none() {
                    return Err(HookClientError::invalid_event(
                        "PreToolUse event missing tool_name".to_string()
                    ));
                }
            }
            "PostToolUse" => {
                if self.tool_name.is_none() {
                    return Err(HookClientError::invalid_event(
                        "PostToolUse event missing tool_name".to_string()
                    ));
                }
            }
            "Notification" => {
                if self.message.is_none() {
                    return Err(HookClientError::invalid_event(
                        "Notification event missing message".to_string()
                    ));
                }
            }
            "UserPromptSubmit" => {
                if self.prompt.is_none() {
                    return Err(HookClientError::invalid_event(
                        "UserPromptSubmit event missing prompt".to_string()
                    ));
                }
            }
            "PreCompact" => {
                if self.trigger.is_none() {
                    return Err(HookClientError::invalid_event(
                        "PreCompact event missing trigger".to_string()
                    ));
                }
            }
            "SessionStart" => {
                if self.source.is_none() {
                    return Err(HookClientError::invalid_event(
                        "SessionStart event missing source".to_string()
                    ));
                }
            }
            "Stop" | "SubagentStop" => {
                // These events don't require additional fields
            }
            _ => {
                return Err(HookClientError::invalid_event(format!(
                    "Unknown hook event type: {}",
                    self.hook_event_name
                )));
            }
        }
        Ok(())
    }
}

/// Response for blocking hook events (PreToolUse)
/// This is what we return to Claude Code to allow/deny tool execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockingResponse {
    pub behavior: String, // "allow" or "deny"
    pub message: String,
}

impl BlockingResponse {
    pub fn allow<S: Into<String>>(message: S) -> Self {
        Self {
            behavior: "allow".to_string(),
            message: message.into(),
        }
    }
    
    pub fn deny<S: Into<String>>(message: S) -> Self {
        Self {
            behavior: "deny".to_string(),
            message: message.into(),
        }
    }
    
    pub fn is_allowed(&self) -> bool {
        self.behavior == "allow"
    }
}

/// Event metadata for tracking and processing
#[derive(Debug, Clone)]
pub struct EventMetadata {
    pub id: Uuid,
    pub received_at: chrono::DateTime<chrono::Utc>,
    pub processing_time_ms: Option<u64>,
}

impl EventMetadata {
    pub fn new() -> Self {
        Self {
            id: Uuid::new_v4(),
            received_at: chrono::Utc::now(),
            processing_time_ms: None,
        }
    }
    
    pub fn with_processing_time(mut self, time_ms: u64) -> Self {
        self.processing_time_ms = Some(time_ms);
        self
    }
}