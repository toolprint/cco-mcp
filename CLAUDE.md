# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CCO-MCP (Claude Code Oversight - Model Context Protocol) is a comprehensive audit and approval system for Claude Code tool calls. It consists of:

- A Node.js/TypeScript MCP server backend with Express REST API
- A React/TypeScript web dashboard UI
- Real-time updates via Server-Sent Events (SSE)
- Rule-based approval configuration system

## Development Commands

### Build Commands

```bash
# Build everything (backend + UI)
just build-all
# or
pnpm build:all

# Build backend only
just build
# or
pnpm build

# Build UI only
just build-ui
# or
pnpm build:ui

# Watch mode for backend
just build-watch
# or
pnpm build:watch
```

### Development Commands

```bash
# Run both backend and UI in development mode
just dev-all
# or
pnpm dev:all

# Run backend only
just dev
# or
pnpm dev

# Run UI only
just dev-ui
# or
pnpm dev:ui

# Inspect MCP server
just inspect
# or
pnpm inspect
```

### Code Quality Commands

```bash
# Format code
just format
# or
pnpm format

# Check formatting
just format-check
# or
pnpm format:check

# Lint
just lint
# or
pnpm lint
```

### Testing Commands

```bash
# Run tests (currently echoes no tests configured)
just test
# or
pnpm test

# E2E tests with recording options
just e2e-test          # Without recording
just e2e-test-browser  # Browser recording only
just e2e-test-terminal # Terminal recording only
just e2e-test-full     # Both recordings
```

## Architecture Overview

### Backend Architecture

The backend follows a modular architecture:

1. **MCP Integration** (`src/server.ts`)

   - Implements the MCP server with `approval_prompt` tool
   - Handles polling mechanism for approval/denial
   - Integrates with the audit service

2. **Express API** (`src/app.ts`)

   - REST endpoints for audit logs and configuration
   - SSE endpoint for real-time updates
   - Static file serving for UI in production

3. **Audit Service** (`src/audit/`)

   - In-memory LRU cache with TTL support
   - Event-driven architecture using EventEmitter
   - Handles state transitions (NEEDS_REVIEW → APPROVED/DENIED)

4. **Configuration Service** (`src/services/ConfigurationService.ts`)

   - Rule-based approval system with priority ordering
   - Supports built-in tools and MCP server tools
   - Hot-reload configuration with file watcher
   - Tool matching logic for both types:
     - Built-in: Direct tool name matching
     - MCP: Format `mcp__serverName__toolName`

5. **Type System** (`src/config/types.ts`)
   - ToolMatch discriminated union:
     ```typescript
     type ToolMatch = BuiltInToolMatch | MCPToolMatch;
     ```
   - Zod schemas for validation (`src/config/schema.ts`)

### Frontend Architecture

The React UI uses modern patterns:

1. **Real-time Updates** (`src/contexts/SSEContext.tsx`)

   - Server-Sent Events integration
   - Automatic reconnection with exponential backoff
   - Global SSE state management

2. **Page Structure**

   - `/dashboard` - Main audit log view (`src/AppFinal.tsx`)
   - `/config` - Configuration management (`src/pages/Configuration.tsx`)

3. **Component Organization**

   - `components/config/` - Rule management components
   - `components/ui/` - Reusable UI primitives
   - `components/layout/` - Header/footer components

4. **State Management**

   - Custom hooks for API calls (`src/hooks/`)
   - React Context for SSE connection
   - Local state for UI interactions

5. **Styling**
   - Tailwind CSS with Blueprint-inspired theme
   - Dark mode support
   - CSS custom properties for theming

### Key Integration Points

1. **Tool Call Flow**:

   ```
   Claude Code → MCP approval_prompt → Audit Service → Express API → UI
   ```

2. **Configuration Updates**:

   ```
   UI → REST API → ConfigurationService → File System → Hot Reload
   ```

3. **Real-time Updates**:
   ```
   Audit Service Events → SSE Stream → React Context → UI Components
   ```

### Configuration Format

The new ToolMatch format distinguishes between tool types:

```typescript
// Built-in tool
{
  "tool": {
    "type": "builtin",
    "toolName": "Read"
  }
}

// MCP server tool
{
  "tool": {
    "type": "mcp",
    "serverName": "git",
    "toolName": "git_status" // Optional
  }
}
```

### Development Tips

1. **Adding New Tools**: Update the tool matching logic in `ConfigurationService.matchesTool()`

2. **UI Components**: Follow the existing pattern in `components/ui/` for new components

3. **API Endpoints**: Add routes in `src/routes/` and update the router in `src/app.ts`

4. **Configuration Changes**: Update both types (`src/config/types.ts`) and schemas (`src/config/schema.ts`)

5. **Build Process**: The backend build copies UI dist files automatically via `tsup.config.ts`

### Environment Variables

- `PORT` - Server port (default: 8660)
- `CCO_CONFIG_PATH` - Configuration file path (default: ~/.cco-mcp/config.json)

### Production Deployment

1. Build everything: `just build-all`
2. The backend serves the UI from `/dist/ui`
3. Run with: `just prod` or `pnpm prod`
4. Docker support available via `docker-compose.yml`
