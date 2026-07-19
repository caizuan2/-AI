# AI Brain prompt boundary

Phase 11 does not send raw business records to a new model prompt. The extraction pipeline is deterministic: it loads an authorized structured record, applies source quality rules, performs bounded pattern-based contact/identifier redaction, and creates a reviewable candidate. This is not a complete DLP system; the reviewer remains responsible for catching unstructured confidential details.

If a later phase introduces model-assisted rewriting, the prompt must receive only the already authorized and redacted `KnowledgeExtractionMaterial`. The model output must be redacted again, bounded to the current title/category/content limits, stored as `PENDING`, and reviewed by a human before the existing knowledge service is called. Prompts must never receive CRM identity fields, workflow `triggerData`, attachments, credentials, API keys, or cross-tenant records.
