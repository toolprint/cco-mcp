# CCO-MCP (Claude Code Oversight - Model Context Protocol)

A comprehensive audit and approval system for Claude Code tool calls, featuring a real-time web dashboard for monitoring and managing AI agent tool usage.

## Overview

CCO-MCP provides a secure approval layer for AI tool calls with:

- **In-memory audit logging** with configurable TTL and LRU eviction
- **RESTful API** for audit log access and approval/denial actions
- **Real-time updates** via Server-Sent Events (SSE)
- **Web dashboard** for monitoring and managing tool approvals
- **MCP integration** for seamless Claude Code integration

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │────▶│   MCP Server    │────▶│  Audit Service  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                          │
                               ▼                          ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │   REST API      │────▶│   Web Dashboard │
                        └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   SSE Stream    │
                        └─────────────────┘
```

## Features

### Backend (Node.js/TypeScript)

1. **In-Memory Audit Log Service**

   - LRU cache with configurable max entries (default: 1000)
   - Configurable TTL for entries (default: 24 hours)
   - Auto-deny timeout for unapproved requests (default: 5 minutes)
   - Event-driven architecture with EventEmitter

2. **REST API Endpoints**

   - `GET /api/audit-log` - Query audit log entries with filtering
   - `GET /api/audit-log/:id` - Get specific entry details
   - `POST /api/audit-log/:id/approve` - Approve a tool request
   - `POST /api/audit-log/:id/deny` - Deny a tool request
   - `GET /api/audit-log/stream` - SSE endpoint for real-time updates

3. **MCP Integration**
   - `approval_prompt` tool that integrates with the audit log
   - Polling mechanism to wait for approval/denial
   - Environment variable support for auto-approval mode

### Frontend (React/TypeScript/Vite)

1. **Real-Time Dashboard**

   - Live updates via SSE integration
   - Visual indicators for connection status
   - Toast notifications for important events

2. **Filtering & Search**

   - Filter by approval state (Approved/Denied/Needs Review)
   - Filter by agent identity
   - Search across tool names and input parameters
   - Pagination with 10 items per page

3. **Interactive Controls**

   - One-click approve/deny actions
   - Bulk actions support
   - Collapsible filter panel
   - Statistics overview

4. **UI Polish**
   - Responsive design with mobile support
   - Dark mode support
   - Empty states with helpful messaging
   - Loading and error states
   - Smooth animations and transitions

## Installation

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Backend Setup

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Start the server
pnpm start
```

### Frontend Setup

```bash
# Navigate to UI directory
cd ui

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

## Configuration

### Environment Variables

- `PORT` - Server port (default: 8660)
- `CCO_CONFIG_PATH` - Path to configuration file (default: ~/.cco-mcp/config.json)

### Approval Configuration

CCO-MCP uses a flexible rule-based configuration system for managing approvals. By default, approval mode is enabled and all requests require manual review. You can customize this behavior by creating rules in the configuration file.

See [Configuration Guide](docs/CONFIGURATION.md) for detailed documentation on:
- Creating approval rules
- Pattern matching options
- API endpoints for managing configuration
- Example configurations

### MCP Configuration

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "cco-mcp": {
      "command": "node",
      "args": ["/path/to/cco-mcp/dist/index.js"],
      "env": {
        "CCO_CONFIG_PATH": "/path/to/config.json"
      }
    }
  }
}
```

## Usage

1. **Start the backend server:**

   ```bash
   pnpm start
   ```

2. **Start the UI development server:**

   ```bash
   cd ui && pnpm dev
   ```

3. **Access the dashboard:**
   Open http://localhost:5173 in your browser

4. **Configure Claude Code:**
   Add the MCP server to your Claude Desktop configuration

## API Documentation

### Query Parameters

All list endpoints support:

- `state` - Filter by state (APPROVED, DENIED, NEEDS_REVIEW)
- `agent_identity` - Filter by agent identity
- `search` - Search in tool names and inputs
- `offset` - Pagination offset (default: 0)
- `limit` - Results per page (default: 100, max: 1000)

### SSE Event Types

- `connected` - Initial connection established
- `new-entry` - New audit log entry created
- `state-change` - Entry state changed (approved/denied)
- `entry-expired` - Entry expired due to TTL
- `heartbeat` - Keep-alive signal

## Development

### Project Structure

```
cco-mcp/
├── src/
│   ├── audit/          # Audit log service implementation
│   ├── routes/         # Express route handlers
│   ├── server.ts       # MCP server implementation
│   ├── app.ts          # Express app setup
│   └── index.ts        # Entry point
├── ui/
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── hooks/      # Custom React hooks
│   │   └── types/      # TypeScript type definitions
│   └── dist/           # Production build
└── dist/               # Backend build output
```

### Key Design Decisions

1. **In-Memory Storage**: Chosen for simplicity and performance. The audit log is ephemeral by design.

2. **SSE over WebSockets**: Server-Sent Events provide simpler implementation for one-way real-time updates.

3. **Polling for Approval**: The MCP tool polls for approval status to maintain stateless HTTP connections.

4. **TypeScript**: Full type safety across backend and frontend for better developer experience.

5. **Tailwind CSS**: Utility-first CSS for rapid UI development with consistent styling.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with appropriate tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

Built for use with Claude Code and the Model Context Protocol (MCP) by Anthropic.
