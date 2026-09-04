CREATE INDEX "document_generation_audit_workspace_duration_idx" ON "soba"."document_generation_audit" USING btree ("workspace_id","duration_ms" DESC,"id" DESC);
CREATE INDEX "document_generation_audit_workspace_outcome_idx" ON "soba"."document_generation_audit" USING btree ("workspace_id","outcome","id" DESC);
CREATE INDEX "document_generation_audit_form_duration_idx" ON "soba"."document_generation_audit" USING btree ("form_id","duration_ms" DESC,"id" DESC);
CREATE INDEX "document_generation_audit_form_outcome_idx" ON "soba"."document_generation_audit" USING btree ("form_id","outcome","id" DESC);
