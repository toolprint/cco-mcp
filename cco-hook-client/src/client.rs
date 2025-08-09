use reqwest::{Client, ClientBuilder, Response};
use serde_json;
use std::time::{Duration, Instant};
use tokio::time::sleep;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::config::{Config, ClientConfig, ServerConfig};
use crate::error::{HookClientError, Result};
use crate::events::{BlockingResponse, HookEvent};

/// HTTP client for communicating with CCO-MCP server
pub struct HttpClient {
    client: Client,
    server_config: ServerConfig,
    client_config: ClientConfig,
}

impl HttpClient {
    /// Create a new HTTP client with the given configuration
    pub async fn new(config: &Config) -> Result<Self> {
        let client = ClientBuilder::new()
            .timeout(config.client.connection_timeout())
            .pool_max_idle_per_host(config.client.pool_max_idle_per_host)
            .pool_idle_timeout(Some(Duration::from_secs(90)))
            .connect_timeout(Duration::from_secs(10))
            .tcp_keepalive(Some(Duration::from_secs(60)))
            .user_agent(format!(
                "cco-hook-client/{} ({})",
                env!("CARGO_PKG_VERSION"),
                std::env::consts::OS
            ))
            .build()
            .map_err(|e| HookClientError::config(format!("Failed to create HTTP client: {}", e)))?;

        debug!(
            server_url = %config.server.url()?,
            timeout_ms = config.client.connection_timeout_ms,
            max_retries = config.client.max_retries,
            pool_size = config.client.pool_max_idle_per_host,
            "HTTP client initialized"
        );

        Ok(Self {
            client,
            server_config: config.server.clone(),
            client_config: config.client.clone(),
        })
    }

    /// Send a hook event to the server with retry logic
    pub async fn send_event(&self, event: &HookEvent) -> Result<Option<BlockingResponse>> {
        let event_id = Uuid::new_v4();
        let start_time = Instant::now();

        debug!(
            event_id = %event_id,
            event_type = %event.event_type(),
            session_id = event.session_id(),
            tool_name = event.tool_name(),
            "Sending hook event to server"
        );

        let response = self.send_with_retry(event, event_id).await?;
        let elapsed = start_time.elapsed();

        // For PreToolUse events, parse and return the blocking response
        if event.requires_response() {
            let blocking_response = self.parse_blocking_response(response, event_id).await?;
            
            info!(
                event_id = %event_id,
                event_type = %event.event_type(),
                tool_name = event.tool_name(),
                behavior = %blocking_response.behavior,
                processing_time_ms = elapsed.as_millis() as u64,
                "PreToolUse event processed with blocking response"
            );

            Ok(Some(blocking_response))
        } else {
            info!(
                event_id = %event_id,
                event_type = %event.event_type(),
                processing_time_ms = elapsed.as_millis() as u64,
                "Hook event processed successfully"
            );

            Ok(None)
        }
    }

    /// Send event with exponential backoff retry logic
    async fn send_with_retry(&self, event: &HookEvent, event_id: Uuid) -> Result<Response> {
        let mut attempt = 0;
        let mut backoff = self.client_config.initial_backoff();
        let max_backoff = self.client_config.max_backoff();

        loop {
            attempt += 1;

            match self.try_send_event(event, event_id, attempt).await {
                Ok(response) => {
                    if attempt > 1 {
                        info!(
                            event_id = %event_id,
                            attempt,
                            "Request succeeded after retries"
                        );
                    }
                    return Ok(response);
                }
                Err(e) if attempt <= self.client_config.max_retries && e.is_retryable() => {
                    warn!(
                        event_id = %event_id,
                        attempt,
                        max_attempts = self.client_config.max_retries,
                        backoff_ms = backoff.as_millis(),
                        error = %e,
                        "Request failed, retrying"
                    );

                    sleep(backoff).await;

                    // Exponential backoff with jitter
                    let jitter = (rand::random() % 100) as f64 / 1000.0; // 0-10% jitter
                    backoff = std::cmp::min(
                        backoff.mul_f64(2.0 + jitter),
                        max_backoff,
                    );
                }
                Err(e) => {
                    error!(
                        event_id = %event_id,
                        attempts = attempt,
                        error = %e,
                        is_retryable = e.is_retryable(),
                        "Request failed permanently"
                    );

                    return if attempt > self.client_config.max_retries {
                        Err(HookClientError::server_communication(attempt, e.to_string()))
                    } else {
                        Err(e)
                    };
                }
            }
        }
    }

    /// Attempt to send event once
    async fn try_send_event(
        &self,
        event: &HookEvent,
        event_id: Uuid,
        attempt: usize,
    ) -> Result<Response> {
        let url = self.server_config.event_url()?;

        debug!(
            event_id = %event_id,
            attempt,
            url = %url,
            "Sending HTTP request"
        );

        let response = self
            .client
            .post(url)
            .json(event)
            .header("X-Request-ID", event_id.to_string())
            .timeout(self.server_config.timeout())
            .send()
            .await
            .map_err(crate::error::convert_reqwest_error)?;

        // Check for HTTP errors
        if !response.status().is_success() {
            let status = response.status();
            let error_body = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read error response".to_string());

            return Err(HookClientError::http_error(
                status.as_u16(),
                error_body,
            ));
        }

        debug!(
            event_id = %event_id,
            attempt,
            status = %response.status(),
            "Received successful HTTP response"
        );

        Ok(response)
    }

    /// Parse blocking response from HTTP response
    async fn parse_blocking_response(
        &self,
        response: Response,
        event_id: Uuid,
    ) -> Result<BlockingResponse> {
        let response_text = response.text().await.map_err(|e| {
            error!(
                event_id = %event_id,
                error = %e,
                "Failed to read response body"
            );
            crate::error::convert_reqwest_error(e)
        })?;

        debug!(
            event_id = %event_id,
            response_length = response_text.len(),
            "Parsing blocking response"
        );

        let blocking_response: BlockingResponse = serde_json::from_str(&response_text)
            .map_err(|e| {
                error!(
                    event_id = %event_id,
                    error = %e,
                    response_body = %response_text.chars().take(500).collect::<String>(),
                    "Failed to parse blocking response JSON"
                );
                
                // Return a default "allow" response on parse error to be safe
                warn!(
                    event_id = %event_id,
                    "Defaulting to 'allow' due to parse error"
                );
                
                return HookClientError::JsonParse { source: e };
            })?;

        // Validate the response
        blocking_response.validate().map_err(|e| {
            warn!(
                event_id = %event_id,
                error = %e,
                "Invalid blocking response from server"
            );
            e
        })?;

        match blocking_response.behavior.as_str() {
            "allow" => {
                debug!(
                    event_id = %event_id,
                    message = %blocking_response.message,
                    "Server allowed tool execution"
                );
            }
            "deny" => {
                info!(
                    event_id = %event_id,
                    message = %blocking_response.message,
                    "Server denied tool execution"
                );
            }
            "ask" => {
                info!(
                    event_id = %event_id,
                    message = %blocking_response.message,
                    "Server requested user approval for tool execution"
                );
            }
            _ => {
                // This should not happen after validation
                warn!(
                    event_id = %event_id,
                    behavior = %blocking_response.behavior,
                    "Unknown blocking behavior from server (validation should have caught this)"
                );
            }
        }

        Ok(blocking_response)
    }

    /// Perform a health check against the server
    pub async fn health_check(&self) -> Result<()> {
        debug!("Performing server health check");

        let url = self.server_config.url()?;
        let health_url = format!("{}/health", url);

        let response = self
            .client
            .get(&health_url)
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(crate::error::convert_reqwest_error)?;

        if response.status().is_success() {
            info!("Server health check passed");
            Ok(())
        } else {
            Err(HookClientError::http_error(
                response.status().as_u16(),
                format!("Health check failed: {}", response.status()),
            ))
        }
    }

    /// Get client statistics
    pub fn get_stats(&self) -> ClientStats {
        ClientStats {
            server_url: self.server_config.url().map(|u| u.to_string()).unwrap_or_default(),
            max_retries: self.client_config.max_retries,
            connection_timeout_ms: self.client_config.connection_timeout_ms,
            pool_max_idle: self.client_config.pool_max_idle_per_host,
            keep_alive: self.client_config.keep_alive,
        }
    }
}

/// Client statistics and configuration info
#[derive(Debug, Clone)]
pub struct ClientStats {
    pub server_url: String,
    pub max_retries: usize,
    pub connection_timeout_ms: u64,
    pub pool_max_idle: usize,
    pub keep_alive: bool,
}

// Simple random number generation for jitter without additional dependencies
mod rand {
    use std::sync::atomic::{AtomicU64, Ordering};
    
    static SEED: AtomicU64 = AtomicU64::new(1);

    pub fn random() -> u64 {
        // Simple linear congruential generator
        let prev = SEED.load(Ordering::Relaxed);
        let next = prev.wrapping_mul(1103515245).wrapping_add(12345);
        SEED.store(next, Ordering::Relaxed);
        next
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::*;
    use std::collections::HashMap;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn create_test_client() -> (HttpClient, MockServer) {
        let mock_server = MockServer::start().await;
        let base_url = mock_server.uri();
        
        let mut config = Config::default();
        config.server.host = "127.0.0.1".to_string();
        config.server.port = base_url.strip_prefix("http://127.0.0.1:").unwrap().parse().unwrap();
        config.server.base_path = "/api/hooks".to_string();
        
        let client = HttpClient::new(&config).await.unwrap();
        (client, mock_server)
    }

    fn create_test_event() -> HookEvent {
        HookEvent::PreToolUse {
            session_id: "test-session".to_string(),
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            tool: HookTool {
                name: "TestTool".to_string(),
                input: HashMap::new(),
                output: None,
                error: None,
            },
            agent_identity: None,
        }
    }

    #[tokio::test]
    async fn test_successful_request() {
        let (client, mock_server) = create_test_client().await;

        Mock::given(method("POST"))
            .and(path("/api/hooks/event"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "behavior": "allow",
                "message": "Tool allowed"
            })))
            .mount(&mock_server)
            .await;

        let event = create_test_event();
        let response = client.send_event(&event).await.unwrap();

        assert!(response.is_some());
        let blocking_response = response.unwrap();
        assert!(blocking_response.is_allowed());
        assert_eq!(blocking_response.message, Some("Tool allowed".to_string()));
    }

    #[tokio::test]
    async fn test_retry_on_server_error() {
        let (client, mock_server) = create_test_client().await;

        // First request fails, second succeeds
        Mock::given(method("POST"))
            .and(path("/api/hooks/event"))
            .respond_with(ResponseTemplate::new(500))
            .up_to_n_times(1)
            .mount(&mock_server)
            .await;

        Mock::given(method("POST"))
            .and(path("/api/hooks/event"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "behavior": "allow"
            })))
            .mount(&mock_server)
            .await;

        let event = create_test_event();
        let response = client.send_event(&event).await.unwrap();

        assert!(response.is_some());
    }

    #[tokio::test]
    async fn test_no_retry_on_client_error() {
        let (client, mock_server) = create_test_client().await;

        Mock::given(method("POST"))
            .and(path("/api/hooks/event"))
            .respond_with(ResponseTemplate::new(400).set_body_string("Bad Request"))
            .mount(&mock_server)
            .await;

        let event = create_test_event();
        let result = client.send_event(&event).await;

        assert!(result.is_err());
        let error = result.unwrap_err();
        assert!(matches!(error, HookClientError::HttpError { status: 400, .. }));
    }

    #[tokio::test]
    async fn test_non_pretooluse_event() {
        let (client, mock_server) = create_test_client().await;

        Mock::given(method("POST"))
            .and(path("/api/hooks/event"))
            .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
                "success": true,
                "eventId": "test-event-id"
            })))
            .mount(&mock_server)
            .await;

        let event = HookEvent::Notification {
            session_id: "test-session".to_string(),
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            message: "Test notification".to_string(),
            level: NotificationLevel::Info,
        };

        let response = client.send_event(&event).await.unwrap();
        assert!(response.is_none()); // No blocking response for notifications
    }
}