# CCO-MCP UI

A modern React-based web dashboard for the Claude Code Oversight MCP server, providing real-time monitoring and management of AI tool call approvals.

## Overview

The CCO-MCP UI is built with React, TypeScript, and Vite, offering a responsive interface for:
- Monitoring AI agent tool calls in real-time
- Approving or denying tool requests
- Managing approval rules and configurations
- Viewing audit logs and statistics

## Features

### Real-Time Monitoring
- **Server-Sent Events (SSE)** for live updates
- Connection status indicators
- Automatic reconnection with exponential backoff
- Toast notifications for important events

### Audit Log Management
- Filter by status (Approved/Denied/Needs Review)
- Filter by agent identity
- Search across tool names and parameters
- Pagination support
- Expandable JSON viewers for detailed inspection

### Configuration Interface
- Visual rule editor with priority management
- Support for built-in and MCP server tools
- Rule testing and validation
- Enable/disable individual rules
- Global approval settings

### Design System
- Blueprint-inspired design theme
- Dark mode support
- Responsive layouts for all screen sizes
- Loading skeletons and smooth transitions
- Accessible components following WCAG guidelines

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Icon library
- **React Router** - Client-side routing

## Development

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm

### Setup
```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Project Structure
```
ui/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── config/       # Configuration-related components
│   │   ├── layout/       # Layout components (header, footer)
│   │   └── ui/           # Base UI components
│   ├── contexts/         # React contexts (SSE)
│   ├── hooks/            # Custom React hooks
│   ├── pages/            # Page components
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   └── lib/              # External library utilities
├── public/               # Static assets
└── dist/                 # Production build output
```

### Key Components

#### AuditLogList
Displays the list of audit log entries with actions for approval/denial.

#### RuleModal
Modal dialog for creating and editing approval rules with form validation.

#### ConfigurationService
Manages communication with the backend configuration API.

#### SSEContext
Provides real-time updates throughout the application via Server-Sent Events.

## Configuration

### Environment Variables
The UI automatically connects to the backend API on the same host. In development, it proxies requests to `http://localhost:8660`.

### Build Configuration
The Vite configuration handles:
- Development proxy to backend API
- Production build optimization
- TypeScript path aliases

## Styling

The UI uses a combination of:
- **Tailwind CSS** for utility classes
- **CSS custom properties** for theming
- **Blueprint-inspired** color palette and patterns

### Color Scheme
- Primary: Blue (#60a5fa)
- Background: Dark gray (#111827)
- Text: White/Gray scale
- Success: Green (#10b981)
- Error: Red (#ef4444)

## Testing

```bash
# Run type checking
pnpm type-check

# Run linting
pnpm lint
```

## Deployment

The UI is built as static files that can be served by any web server. The production build includes:
- Minified JavaScript and CSS
- Optimized assets
- Source maps for debugging

```bash
# Build for production
pnpm build

# Files will be in dist/ directory
```

## Contributing

1. Follow the existing code style
2. Use TypeScript for all new code
3. Add proper types for components and hooks
4. Test on multiple screen sizes
5. Ensure accessibility standards are met

## License

MIT License - see parent LICENSE file for details