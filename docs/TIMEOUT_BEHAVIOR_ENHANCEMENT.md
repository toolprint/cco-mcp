# Timeout Behavior Enhancement Feature Proposal

## Overview

This proposal addresses the current timeout behavior in CCO-MCP where tool requests are automatically denied after 5 minutes, which blocks development workflows. The enhancement introduces configurable timeout actions with development-friendly defaults and user-centric configuration options.

## Problem Statement

**Current Issues:**

- Tool requests are auto-denied after 5 minutes timeout, blocking development
- Fixed "deny" timeout action provides poor developer experience
- No differentiation between interactive hooks vs non-interactive MCP requests
- Users cannot easily switch between development and production enforcement modes

**Impact:**

- Developers must constantly re-approve tool requests during long sessions
- Workflow interruption reduces productivity
- One-size-fits-all timeout behavior doesn't match varied use cases

## Proposed Solution

### Core Features

1. **Configurable Timeout Actions**: Support "approve", "deny", and "warn" actions on timeout
2. **Development/Production Modes**: Pre-configured settings for common scenarios
3. **Context-Aware Timeouts**: Different behavior for hooks vs MCP requests
4. **User-Friendly Configuration**: Simple mode switching with advanced customization

### Architecture Changes

#### 1. Configuration Structure Enhancement

**Current:**

```typescript
interface TimeoutConfig {
  duration: number;
  defaultAction: "approve" | "deny";
}
```

**Proposed:**

```typescript
interface TimeoutConfig {
  duration: number;
  defaultAction: "approve" | "deny" | "warn";
  hookEvents?: {
    duration: number;
    defaultAction: "approve" | "deny" | "warn";
  };
  mcpRequests?: {
    duration: number;
    defaultAction: "approve" | "deny" | "warn";
  };
}

interface EnforcementMode {
  name: "development" | "production" | "custom";
  approvals: ApprovalsConfig;
}
```

#### 2. Configuration Presets

**Development Mode:**

```typescript
DEVELOPMENT_MODE: {
  name: "development",
  approvals: {
    enabled: true,
    defaultAction: "review",
    timeout: {
      duration: 900000, // 15 minutes
      defaultAction: "approve", // Allow on timeout
      hookEvents: {
        duration: 1800000, // 30 minutes
        defaultAction: "approve"
      },
      mcpRequests: {
        duration: 900000, // 15 minutes
        defaultAction: "approve"
      }
    }
  }
}
```

**Production Mode:**

```typescript
PRODUCTION_MODE: {
  name: "production",
  approvals: {
    enabled: true,
    defaultAction: "review",
    timeout: {
      duration: 300000, // 5 minutes
      defaultAction: "deny", // Deny on timeout
      hookEvents: {
        duration: 180000, // 3 minutes
        defaultAction: "deny"
      },
      mcpRequests: {
        duration: 300000, // 5 minutes
        defaultAction: "deny"
      }
    }
  }
}
```

### UI/UX Design

#### Mode Selector Component

- Three-way toggle: **Development** | **Production** | **Custom**
- Visual indicators with color coding:
  - 🟢 Development (Green) - Permissive, workflow-friendly
  - 🔴 Production (Red) - Secure, restrictive
  - 🔵 Custom (Blue) - User-defined settings

#### Configuration Interface

```
┌─ Timeout Behavior ─────────────────────────────────┐
│ Mode: [Development ▼] [Production] [Custom]        │
│                                                     │
│ 🟢 Development Mode Active                         │
│ → Longer timeouts, auto-approve on timeout        │
│ → Optimized for uninterrupted development         │
│                                                     │
│ ├─ Quick Settings ─────────────────────────────────│
│ │  Timeout Duration: [15] minutes                  │
│ │  Timeout Action:   [Approve ▼]                  │
│ │                                                   │
│ └─ Advanced Settings ▼ ────────────────────────────│
│    │ Interactive Hook Events:                      │
│    │   Duration: [30] minutes                      │
│    │   Action:   [Approve ▼]                      │
│    │                                               │
│    │ Non-Interactive MCP Requests:                 │
│    │   Duration: [15] minutes                      │
│    │   Action:   [Approve ▼]                      │
│    └───────────────────────────────────────────────│
│                                                     │
│ ⚠️  Development mode allows auto-approval on        │
│    timeout. Switch to Production for security.     │
└─────────────────────────────────────────────────────┘
```

### Implementation Phases

#### Phase 1: Core Timeout Behavior (High Priority)

1. **Update Default Configuration**

   - Change `DEFAULT_TIMEOUT_CONFIG.defaultAction` from `"deny"` to `"approve"`
   - Immediate relief for development blocking

2. **Enhance Audit Service**

   - Rename `autoDenyEntry()` to `autoResolveEntry()`
   - Support both approve and deny timeout actions
   - Integration with ConfigurationService for dynamic timeout behavior

3. **Backend Configuration Updates**
   - Extend configuration types and schema
   - Add validation for new timeout options
   - Maintain backward compatibility

#### Phase 2: Mode-Based Configuration (Medium Priority)

4. **Add Enforcement Modes**

   - Development/Production/Custom mode presets
   - Mode switching validation and warnings
   - Configuration migration utilities

5. **UI Mode Selector**
   - Simple three-way mode toggle
   - Visual indicators and descriptions
   - Quick preset switching with confirmation dialogs

#### Phase 3: Advanced Features (Low Priority)

6. **Context-Aware Timeouts**

   - Separate settings for hooks vs MCP requests
   - Advanced configuration panel
   - Per-context timeout behavior

7. **Enhanced User Experience**
   - Progressive disclosure for advanced settings
   - Contextual help and documentation
   - Configuration export/import functionality

### Technical Implementation Details

#### Backend Changes

**File: `src/config/schema.ts`**

- Update `DEFAULT_TIMEOUT_CONFIG` to use "approve" action
- Add mode preset configurations
- Extend Zod validation schemas

**File: `src/audit/service.ts`**

- Rename `autoDenyEntry()` to `autoResolveEntry()`
- Add ConfigurationService dependency injection
- Implement dynamic timeout action resolution

**File: `src/services/ConfigurationService.ts`**

- Add `getEnforcementMode()` and `setEnforcementMode()` methods
- Extend timeout action configuration handling
- Add preset management utilities

#### Frontend Changes

**New: `ui/src/components/config/ModeSelector.tsx`**

- Three-way mode toggle component
- Mode-specific descriptions and warnings
- Confirmation dialogs for mode switching

**New: `ui/src/components/config/TimeoutSettings.tsx`**

- Extract from ApprovalSettings for better organization
- Context-aware timeout configuration
- Progressive disclosure for advanced options

**Update: `ui/src/components/config/ApprovalSettings.tsx`**

- Integrate ModeSelector component
- Update to use new timeout configuration structure
- Add development/production mode indicators

### Migration Strategy

1. **Backward Compatibility**

   - Existing configurations automatically map to "custom" mode
   - Default timeout action changes only apply to new installations
   - Migration utility for existing users

2. **Gradual Rollout**
   - Phase 1 provides immediate development relief
   - Subsequent phases add user-friendly features
   - No breaking changes to existing API

### Success Metrics

1. **Developer Experience**

   - Reduced workflow interruptions from timeouts
   - Faster development iteration cycles
   - Positive user feedback on timeout behavior

2. **Security Maintenance**

   - Production mode adoption rate
   - Clear differentiation between dev and prod configurations
   - No security regressions in production deployments

3. **User Adoption**
   - Mode switching frequency and patterns
   - Advanced feature usage statistics
   - Configuration customization rates

## Implementation Priority

**Immediate (Next Release):**

- Change default timeout action to "approve"
- Basic audit service timeout behavior enhancement

**Short Term (1-2 releases):**

- Mode selector UI component
- Development/Production mode presets

**Long Term (3+ releases):**

- Context-aware hook vs MCP timeout behavior
- Advanced configuration features
- Enhanced user experience improvements

## Conclusion

This enhancement addresses the immediate development blocking issue while laying the foundation for a comprehensive, user-friendly timeout configuration system. The phased approach ensures quick relief for developers while building towards a robust, production-ready solution.

The key innovation is the mode-based approach that maps to real user workflows (development vs production) while maintaining the flexibility for advanced customization through the custom mode.
