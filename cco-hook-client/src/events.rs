use serde::{Deserialize, Serialize};
use tracing::warn;
use uuid::Uuid;

use crate::error::{HookClientError, Result};

/// Known hook event types
pub mod event_types {
    pub const PRE_TOOL_USE: &str = "PreToolUse";
    pub const POST_TOOL_USE: &str = "PostToolUse";
    pub const USER_PROMPT_SUBMIT: &str = "UserPromptSubmit";
    pub const NOTIFICATION: &str = "Notification";
    pub const STOP: &str = "Stop";
    pub const SUBAGENT_STOP: &str = "SubagentStop";
    pub const PRE_COMPACT: &str = "PreCompact";
    pub const SESSION_START: &str = "SessionStart";
}

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
    
    /// Check if this event requires a blocking response
    pub fn requires_response(&self) -> bool {
        matches!(
            self.hook_event_name.as_str(),
            event_types::PRE_TOOL_USE 
            | event_types::USER_PROMPT_SUBMIT 
            | event_types::STOP 
            | event_types::SUBAGENT_STOP
            | event_types::PRE_COMPACT
        )
    }
    
    /// Validate the event has required fields for its type
    pub fn validate(&self) -> Result<()> {
        use event_types::*;
        
        match self.hook_event_name.as_str() {
            PRE_TOOL_USE => {
                if self.tool_name.is_none() {
                    return Err(HookClientError::invalid_event(
                        "PreToolUse event missing tool_name".to_string()
                    ));
                }
            }
            POST_TOOL_USE => {
                if self.tool_name.is_none() {
                    return Err(HookClientError::invalid_event(
                        "PostToolUse event missing tool_name".to_string()
                    ));
                }
            }
            NOTIFICATION => {
                if self.message.is_none() {
                    return Err(HookClientError::invalid_event(
                        "Notification event missing message".to_string()
                    ));
                }
            }
            USER_PROMPT_SUBMIT => {
                if self.prompt.is_none() {
                    return Err(HookClientError::invalid_event(
                        "UserPromptSubmit event missing prompt".to_string()
                    ));
                }
            }
            PRE_COMPACT => {
                if self.trigger.is_none() {
                    return Err(HookClientError::invalid_event(
                        "PreCompact event missing trigger".to_string()
                    ));
                }
            }
            SESSION_START => {
                if self.source.is_none() {
                    return Err(HookClientError::invalid_event(
                        "SessionStart event missing source".to_string()
                    ));
                }
            }
            STOP | SUBAGENT_STOP => {
                // These events don't require additional fields
            }
            _ => {
                // Allow any other event types as Claude Code may add new ones
                // Log a warning for unknown types but don't fail
                warn!(
                    "Unknown hook event type: {}. Proceeding without validation.",
                    self.hook_event_name
                );
            }
        }
        Ok(())
    }
}

/// Response for blocking hook events (PreToolUse)
/// This is what we return to Claude Code to allow/deny/ask for tool execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockingResponse {
    pub behavior: String, // "allow", "deny", or "ask"
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
    
    pub fn ask<S: Into<String>>(message: S) -> Self {
        Self {
            behavior: "ask".to_string(),
            message: message.into(),
        }
    }
    
    pub fn is_allowed(&self) -> bool {
        self.behavior == "allow"
    }
    
    pub fn is_denied(&self) -> bool {
        self.behavior == "deny"
    }
    
    pub fn requires_user_input(&self) -> bool {
        self.behavior == "ask"
    }
    
    /// Validate that the behavior is one of the allowed values
    pub fn validate(&self) -> Result<()> {
        match self.behavior.as_str() {
            "allow" | "deny" | "ask" => Ok(()),
            _ => Err(HookClientError::invalid_event(format!(
                "Invalid blocking behavior: {}. Must be 'allow', 'deny', or 'ask'",
                self.behavior
            ))),
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blocking_response_behaviors() {
        let allow = BlockingResponse::allow("test allow");
        assert_eq!(allow.behavior, "allow");
        assert!(allow.is_allowed());
        assert!(!allow.is_denied());
        assert!(!allow.requires_user_input());
        assert!(allow.validate().is_ok());

        let deny = BlockingResponse::deny("test deny");
        assert_eq!(deny.behavior, "deny");
        assert!(!deny.is_allowed());
        assert!(deny.is_denied());
        assert!(!deny.requires_user_input());
        assert!(deny.validate().is_ok());

        let ask = BlockingResponse::ask("test ask");
        assert_eq!(ask.behavior, "ask");
        assert!(!ask.is_allowed());
        assert!(!ask.is_denied());
        assert!(ask.requires_user_input());
        assert!(ask.validate().is_ok());
    }

    #[test]
    fn test_blocking_response_invalid_behavior() {
        let invalid = BlockingResponse {
            behavior: "invalid".to_string(),
            message: "test".to_string(),
        };
        assert!(invalid.validate().is_err());
    }

    #[test]
    fn test_event_requires_response() {
        let pre_tool_use = HookEvent {
            session_id: "test".to_string(),
            transcript_path: "/test".to_string(),
            cwd: "/test".to_string(),
            hook_event_name: event_types::PRE_TOOL_USE.to_string(),
            tool_name: Some("Bash".to_string()),
            tool_input: None,
            tool_response: None,
            message: None,
            stop_hook_active: None,
            prompt: None,
            trigger: None,
            custom_instructions: None,
            source: None,
        };
        assert!(pre_tool_use.requires_response());

        let notification = HookEvent {
            session_id: "test".to_string(),
            transcript_path: "/test".to_string(),
            cwd: "/test".to_string(),
            hook_event_name: event_types::NOTIFICATION.to_string(),
            tool_name: None,
            tool_input: None,
            tool_response: None,
            message: Some("test".to_string()),
            stop_hook_active: None,
            prompt: None,
            trigger: None,
            custom_instructions: None,
            source: None,
        };
        assert!(!notification.requires_response());
    }

    #[test]
    fn test_event_validation() {
        // Valid PreToolUse
        let valid_pre_tool = HookEvent {
            session_id: "test".to_string(),
            transcript_path: "/test".to_string(),
            cwd: "/test".to_string(),
            hook_event_name: event_types::PRE_TOOL_USE.to_string(),
            tool_name: Some("Bash".to_string()),
            tool_input: None,
            tool_response: None,
            message: None,
            stop_hook_active: None,
            prompt: None,
            trigger: None,
            custom_instructions: None,
            source: None,
        };
        assert!(valid_pre_tool.validate().is_ok());

        // Invalid PreToolUse (missing tool_name)
        let invalid_pre_tool = HookEvent {
            session_id: "test".to_string(),
            transcript_path: "/test".to_string(),
            cwd: "/test".to_string(),
            hook_event_name: event_types::PRE_TOOL_USE.to_string(),
            tool_name: None,
            tool_input: None,
            tool_response: None,
            message: None,
            stop_hook_active: None,
            prompt: None,
            trigger: None,
            custom_instructions: None,
            source: None,
        };
        assert!(invalid_pre_tool.validate().is_err());

        // Valid UserPromptSubmit
        let valid_prompt = HookEvent {
            session_id: "test".to_string(),
            transcript_path: "/test".to_string(),
            cwd: "/test".to_string(),
            hook_event_name: event_types::USER_PROMPT_SUBMIT.to_string(),
            tool_name: None,
            tool_input: None,
            tool_response: None,
            message: None,
            stop_hook_active: None,
            prompt: Some("test prompt".to_string()),
            trigger: None,
            custom_instructions: None,
            source: None,
        };
        assert!(valid_prompt.validate().is_ok());

        // Valid SessionStart
        let valid_session = HookEvent {
            session_id: "test".to_string(),
            transcript_path: "/test".to_string(),
            cwd: "/test".to_string(),
            hook_event_name: event_types::SESSION_START.to_string(),
            tool_name: None,
            tool_input: None,
            tool_response: None,
            message: None,
            stop_hook_active: None,
            prompt: None,
            trigger: None,
            custom_instructions: None,
            source: Some("startup".to_string()),
        };
        assert!(valid_session.validate().is_ok());
    }
}