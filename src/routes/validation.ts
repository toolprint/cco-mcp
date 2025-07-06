import { z } from 'zod';
import { AuditLogState } from '../audit/types.js';

/**
 * Validation schema for audit log query parameters
 */
export const auditLogQuerySchema = z.object({
  // State filter - must be a valid audit log state
  state: z.enum(['APPROVED', 'DENIED', 'NEEDS_REVIEW'] as const).optional(),
  
  // Agent identity filter
  agent_identity: z.string().min(1).max(255).optional(),
  
  // Free-text search
  search: z.string().min(1).max(500).optional(),
  
  // Pagination offset
  offset: z.string()
    .regex(/^\d+$/, 'Offset must be a positive integer')
    .transform(val => parseInt(val, 10))
    .refine(val => val >= 0, 'Offset must be non-negative')
    .optional()
    .default('0'),
  
  // Pagination limit
  limit: z.string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(val => parseInt(val, 10))
    .refine(val => val > 0 && val <= 1000, 'Limit must be between 1 and 1000')
    .optional()
    .default('100')
});

/**
 * Type for validated audit log query parameters
 */
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/**
 * Middleware to validate query parameters
 */
export function validateAuditLogQuery(query: unknown): { 
  success: true; 
  data: AuditLogQuery;
} | { 
  success: false; 
  error: string; 
} {
  try {
    const validated = auditLogQuerySchema.parse(query);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { 
        success: false, 
        error: `Invalid query parameters: ${messages.join(', ')}`
      };
    }
    return { 
      success: false, 
      error: 'Invalid query parameters' 
    };
  }
}