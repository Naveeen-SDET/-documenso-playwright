import { z } from 'zod';

/**
 * Zod schemas for Documenso API contract testing
 *
 * These schemas define the EXACT shape the API must return.
 * If Documenso changes a field name, removes a required field,
 * or changes a type — these schemas catch it immediately.
 *
 * This is contract testing: the schema IS the contract.
 * Used in regulated industries (fintech, legaltech) to prevent
 * silent API breaking changes from reaching production.
 */

// ── Document status enum ──────────────────────────────────────────────────────
export const DocumentStatusSchema = z.enum([
  'DRAFT',
  'PENDING',
  'COMPLETED',
  'DECLINED',
  'CANCELLED',
]);

// ── Recipient role enum ───────────────────────────────────────────────────────
export const RecipientRoleSchema = z.enum([
  'SIGNER',
  'APPROVER',
  'CC',
  'VIEWER',
]);

// ── Recipient schema ──────────────────────────────────────────────────────────
export const RecipientSchema = z.object({
  id:            z.number(),
  documentId:    z.number(),
  email:         z.string().email(),
  name:          z.string(),
  role:          RecipientRoleSchema,
  signingOrder:  z.number().nullable().optional(),
  signingUrl:    z.string().nullable().optional(),
  signedAt:      z.string().nullable().optional(),
  readStatus:    z.string().optional(),
  signingStatus: z.string().optional(),
  sendStatus:    z.string().optional(),
});

// ── Field schema (signature/text fields placed on a document) ─────────────────
export const FieldSchema = z.object({
  id:          z.number(),
  documentId:  z.number(),
  recipientId: z.number(),
  type:        z.string(),          // SIGNATURE, INITIALS, DATE, TEXT, etc.
  page:        z.number(),
  positionX:   z.number(),
  positionY:   z.number(),
  width:       z.number(),
  height:      z.number(),
  customText:  z.string().optional(),
  inserted:    z.boolean().optional(),
});

// ── Core document schema ──────────────────────────────────────────────────────
export const DocumentSchema = z.object({
  id:         z.number(),
  title:      z.string(),
  status:     DocumentStatusSchema,
  createdAt:  z.string(),          // ISO 8601 date string
  updatedAt:  z.string(),
  // Optional fields — may not always be present depending on API version
  userId:     z.number().optional(),
  teamId:     z.number().nullable().optional(),
  recipients: z.array(RecipientSchema).optional(),
  fields:     z.array(FieldSchema).optional(),
});

// ── Document list response schema ─────────────────────────────────────────────
export const DocumentListSchema = z.object({
  documents:  z.array(DocumentSchema),
  totalPages: z.number().nonnegative(),
});

// ── Audit log entry schema ────────────────────────────────────────────────────
// Documenso records every action (created, sent, viewed, signed, etc.)
// This is the regulated-industry differentiator — immutable audit trail
export const AuditLogSchema = z.object({
  id:         z.union([z.number(), z.string()]),
  type:       z.string(),           // DOCUMENT_CREATED, DOCUMENT_SENT, etc.
  createdAt:  z.string(),
  data:       z.record(z.unknown()).optional(),  // arbitrary metadata per event
  email:      z.string().nullable().optional(),
  name:       z.string().nullable().optional(),
  userId:     z.number().nullable().optional(),
  ipAddress:  z.string().nullable().optional(),
});

// ── API error response schema ─────────────────────────────────────────────────
export const ApiErrorSchema = z.object({
  message: z.string(),
});

// ── Type exports (inferred from schemas) ─────────────────────────────────────
export type Document     = z.infer<typeof DocumentSchema>;
export type DocumentList = z.infer<typeof DocumentListSchema>;
export type Recipient    = z.infer<typeof RecipientSchema>;
export type Field        = z.infer<typeof FieldSchema>;
export type AuditLog     = z.infer<typeof AuditLogSchema>;
