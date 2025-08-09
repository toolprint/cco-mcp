#!/usr/bin/env node

/**
 * Claude Code Hook Bridge
 *
 * This script acts as a bridge between Claude Code hooks and the CCO-MCP server.
 * It reads hook events from stdin, forwards them to the CCO-MCP server,
 * and returns blocking responses for PreToolUse events.
 *
 * Usage: node bridge.js
 * This is typically called automatically by Claude Code via hook configuration.
 */

const http = require("http");
const { URL } = require("url");

// Configuration
const CCO_SERVER_HOST = process.env.CCO_SERVER_HOST || "localhost";
const CCO_SERVER_PORT = process.env.CCO_SERVER_PORT || "8660";
const CCO_SERVER_PROTOCOL = process.env.CCO_SERVER_PROTOCOL || "http";
const CCO_HOOKS_ENDPOINT = `${CCO_SERVER_PROTOCOL}://${CCO_SERVER_HOST}:${CCO_SERVER_PORT}/api/hooks/event`;

// Request timeout (10 seconds)
const REQUEST_TIMEOUT_MS = 10000;

// Logging utilities
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logData = data ? ` - ${JSON.stringify(data)}` : "";
  console.error(`[${timestamp}] ${level.toUpperCase()}: ${message}${logData}`);
}

function logInfo(message, data) {
  log("info", message, data);
}

function logWarn(message, data) {
  log("warn", message, data);
}

function logError(message, data) {
  log("error", message, data);
}

/**
 * Send HTTP POST request to CCO-MCP server
 */
function sendHttpRequest(data) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(CCO_HOOKS_ENDPOINT);
    } catch (error) {
      return reject(new Error(`Invalid CCO server URL: ${CCO_HOOKS_ENDPOINT}`));
    }

    const postData = JSON.stringify(data);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": "CCO-MCP-Hook-Bridge/1.0.0",
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const protocol = url.protocol === "https:" ? require("https") : http;
    const req = protocol.request(options, (res) => {
      let responseBody = "";

      res.on("data", (chunk) => {
        responseBody += chunk;
      });

      res.on("end", () => {
        try {
          // Try to parse as JSON
          const parsedResponse = responseBody ? JSON.parse(responseBody) : {};

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              statusCode: res.statusCode,
              body: parsedResponse,
            });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          }
        } catch (parseError) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Success but non-JSON response
            resolve({
              statusCode: res.statusCode,
              body: responseBody,
            });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          }
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`));
    });

    req.on("error", (error) => {
      reject(error);
    });

    // Write data and end request
    req.write(postData);
    req.end();
  });
}

/**
 * Process a hook event
 */
async function processHookEvent(eventData) {
  try {
    logInfo("Processing hook event", {
      type: eventData.type,
      sessionId: eventData.sessionId,
      toolName: eventData.tool?.name,
    });

    const response = await sendHttpRequest(eventData);

    logInfo("Hook event processed successfully", {
      type: eventData.type,
      statusCode: response.statusCode,
      hasResponse: !!response.body,
    });

    // For PreToolUse events, return the blocking response
    if (eventData.type === "PreToolUse") {
      const blockingResponse = response.body;

      // Validate the blocking response
      if (!blockingResponse || typeof blockingResponse !== "object") {
        logWarn("Invalid blocking response, defaulting to allow", {
          response: blockingResponse,
        });
        return {
          behavior: "allow",
          message: "Invalid server response, defaulting to allow",
        };
      }

      if (
        !blockingResponse.behavior ||
        !["allow", "deny"].includes(blockingResponse.behavior)
      ) {
        logWarn("Invalid behavior in blocking response, defaulting to allow", {
          behavior: blockingResponse.behavior,
        });
        return {
          behavior: "allow",
          message: "Invalid behavior in server response, defaulting to allow",
        };
      }

      logInfo("Returning blocking response", {
        behavior: blockingResponse.behavior,
        hasMessage: !!blockingResponse.message,
      });

      return blockingResponse;
    }

    // For other events, no response needed
    return null;
  } catch (error) {
    logError("Error processing hook event", {
      error: error.message,
      type: eventData.type,
    });

    // For PreToolUse events, default to allow on error
    if (eventData.type === "PreToolUse") {
      return {
        behavior: "allow",
        message: `Processing error: ${error.message}`,
      };
    }

    // For other events, just log the error
    return null;
  }
}

/**
 * Main function - read from stdin and process events
 */
async function main() {
  logInfo("CCO-MCP Hook Bridge starting", {
    server: CCO_HOOKS_ENDPOINT,
    pid: process.pid,
  });

  // Set up stdin reading
  process.stdin.setEncoding("utf8");

  let inputBuffer = "";

  process.stdin.on("data", async (chunk) => {
    inputBuffer += chunk;

    // Process complete lines
    const lines = inputBuffer.split("\n");
    inputBuffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      try {
        // Parse the JSON event
        const eventData = JSON.parse(trimmedLine);

        // Process the event
        const result = await processHookEvent(eventData);

        // If there's a result (blocking response), write it to stdout
        if (result) {
          console.log(JSON.stringify(result));
        }
      } catch (parseError) {
        logError("Failed to parse hook event JSON", {
          error: parseError.message,
          line: trimmedLine.substring(0, 200), // First 200 chars for debugging
        });

        // For unparseable PreToolUse-like events, try to default to allow
        // This is a fallback in case we can't parse the event type
        if (
          trimmedLine.includes('"type":"PreToolUse"') ||
          trimmedLine.includes("'type':'PreToolUse'")
        ) {
          console.log(
            JSON.stringify({
              behavior: "allow",
              message: "Parse error, defaulting to allow",
            })
          );
        }
      }
    }
  });

  process.stdin.on("end", () => {
    logInfo("Stdin closed, bridge shutting down");
  });

  process.stdin.on("error", (error) => {
    logError("Stdin error", { error: error.message });
    process.exit(1);
  });

  // Handle process signals
  process.on("SIGINT", () => {
    logInfo("Received SIGINT, shutting down");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logInfo("Received SIGTERM, shutting down");
    process.exit(0);
  });

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    logError("Uncaught exception", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    logError("Unhandled promise rejection", { reason: String(reason) });
    process.exit(1);
  });
}

// Start the bridge
main().catch((error) => {
  logError("Fatal error in main", { error: error.message, stack: error.stack });
  process.exit(1);
});
