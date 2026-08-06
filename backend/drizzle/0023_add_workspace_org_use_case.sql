ALTER TABLE "soba"."workspace" ADD COLUMN "org" text;
ALTER TABLE "soba"."workspace" ADD COLUMN "use_case" text;

UPDATE "soba"."workspace" SET "org" = 'CITZ' WHERE "org" IS NULL;
UPDATE "soba"."workspace" SET "use_case" = 'collection' WHERE "use_case" IS NULL;

ALTER TABLE "soba"."workspace" ALTER COLUMN "org" SET NOT NULL;
ALTER TABLE "soba"."workspace" ALTER COLUMN "use_case" SET NOT NULL;
