import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE OR REPLACE FUNCTION pet_delete_audit()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS $$
    BEGIN
      INSERT INTO pet_audit ("petId", "ownerId")
      SELECT "id", "ownerId"
      FROM OLD;
      RETURN NULL;
    END
  $$;`.execute(db);
  await sql`CREATE OR REPLACE FUNCTION asset_pet_audit()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS $$
    BEGIN
      INSERT INTO asset_pet_audit ("assetPetId", "assetId")
      SELECT "id", "assetId"
      FROM OLD;
      RETURN NULL;
    END
  $$;`.execute(db);
  await sql`ALTER TABLE "asset_job_status" ADD "petsRecognizedAt" timestamp with time zone;`.execute(db);
  await sql`CREATE TABLE "asset_pet_audit" (
  "id" uuid NOT NULL DEFAULT immich_uuid_v7(),
  "assetPetId" uuid NOT NULL,
  "assetId" uuid NOT NULL,
  "deletedAt" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "asset_pet_audit_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "asset_pet_audit_assetPetId_idx" ON "asset_pet_audit" ("assetPetId");`.execute(db);
  await sql`CREATE INDEX "asset_pet_audit_assetId_idx" ON "asset_pet_audit" ("assetId");`.execute(db);
  await sql`CREATE INDEX "asset_pet_audit_deletedAt_idx" ON "asset_pet_audit" ("deletedAt");`.execute(db);
  await sql`CREATE TABLE "pet" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "ownerId" uuid NOT NULL,
  "name" character varying NOT NULL DEFAULT '',
  "thumbnailPath" character varying NOT NULL DEFAULT '',
  "isHidden" boolean NOT NULL DEFAULT false,
  "isFavorite" boolean NOT NULL DEFAULT false,
  "color" character varying,
  "species" character varying NOT NULL DEFAULT '',
  "thumbnailAssetId" uuid,
  "updateId" uuid NOT NULL DEFAULT immich_uuid_v7(),
  CONSTRAINT "pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "pet_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "idx_pet_name_trigram" ON "pet" USING gin (f_unaccent("name") gin_trgm_ops);`.execute(db);
  await sql`CREATE INDEX "pet_ownerId_idx" ON "pet" ("ownerId");`.execute(db);
  await sql`CREATE INDEX "pet_thumbnailAssetId_idx" ON "pet" ("thumbnailAssetId");`.execute(db);
  await sql`CREATE INDEX "pet_updateId_idx" ON "pet" ("updateId");`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "pet_delete_audit"
  AFTER DELETE ON "pet"
  REFERENCING OLD TABLE AS "old"
  FOR EACH STATEMENT
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION pet_delete_audit();`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "pet_updatedAt"
  BEFORE UPDATE ON "pet"
  FOR EACH ROW
  EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE TABLE "asset_pet" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "assetId" uuid NOT NULL,
  "petId" uuid,
  "imageWidth" integer NOT NULL DEFAULT 0,
  "imageHeight" integer NOT NULL DEFAULT 0,
  "boundingBoxX1" integer NOT NULL DEFAULT 0,
  "boundingBoxY1" integer NOT NULL DEFAULT 0,
  "boundingBoxX2" integer NOT NULL DEFAULT 0,
  "boundingBoxY2" integer NOT NULL DEFAULT 0,
  "sourceType" sourcetype NOT NULL DEFAULT 'machine-learning',
  "species" character varying NOT NULL DEFAULT '',
  "deletedAt" timestamp with time zone,
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updateId" uuid NOT NULL DEFAULT immich_uuid_v7(),
  "isVisible" boolean NOT NULL DEFAULT true,
  CONSTRAINT "asset_pet_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "asset_pet_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pet" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "asset_pet_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`ALTER TABLE "pet" ADD CONSTRAINT "pet_thumbnailAssetId_fkey" FOREIGN KEY ("thumbnailAssetId") REFERENCES "asset_pet" ("id") ON UPDATE NO ACTION ON DELETE SET NULL;`.execute(db);
  await sql`CREATE INDEX "asset_pet_petId_assetId_idx" ON "asset_pet" ("petId", "assetId");`.execute(db);
  await sql`CREATE INDEX "asset_pet_petId_assetId_notDeleted_isVisible_idx" ON "asset_pet" ("petId", "assetId") WHERE ("deletedAt" IS NULL AND "isVisible" IS TRUE);`.execute(db);
  await sql`CREATE INDEX "asset_pet_assetId_petId_idx" ON "asset_pet" ("assetId", "petId");`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "asset_pet_audit"
  AFTER DELETE ON "asset_pet"
  REFERENCING OLD TABLE AS "old"
  FOR EACH STATEMENT
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION asset_pet_audit();`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "asset_pet_updatedAt"
  BEFORE UPDATE ON "asset_pet"
  FOR EACH ROW
  EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE TABLE "pet_audit" (
  "id" uuid NOT NULL DEFAULT immich_uuid_v7(),
  "petId" uuid NOT NULL,
  "ownerId" uuid NOT NULL,
  "deletedAt" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "pet_audit_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "pet_audit_petId_idx" ON "pet_audit" ("petId");`.execute(db);
  await sql`CREATE INDEX "pet_audit_ownerId_idx" ON "pet_audit" ("ownerId");`.execute(db);
  await sql`CREATE INDEX "pet_audit_deletedAt_idx" ON "pet_audit" ("deletedAt");`.execute(db);
  await sql`CREATE TABLE "pet_search" (
  "petId" uuid NOT NULL,
  "embedding" vector(1536) NOT NULL,
  CONSTRAINT "pet_search_petId_fkey" FOREIGN KEY ("petId") REFERENCES "asset_pet" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "pet_search_pkey" PRIMARY KEY ("petId")
);`.execute(db);
  await sql`CREATE INDEX "pet_index" ON "pet_search" USING hnsw (embedding vector_cosine_ops) WITH (ef_construction = 300, m = 16);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('function_pet_delete_audit', '{"type":"function","name":"pet_delete_audit","sql":"CREATE OR REPLACE FUNCTION pet_delete_audit()\\n  RETURNS TRIGGER\\n  LANGUAGE PLPGSQL\\n  AS $$\\n    BEGIN\\n      INSERT INTO pet_audit (\\"petId\\", \\"ownerId\\")\\n      SELECT \\"id\\", \\"ownerId\\"\\n      FROM OLD;\\n      RETURN NULL;\\n    END\\n  $$;"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('function_asset_pet_audit', '{"type":"function","name":"asset_pet_audit","sql":"CREATE OR REPLACE FUNCTION asset_pet_audit()\\n  RETURNS TRIGGER\\n  LANGUAGE PLPGSQL\\n  AS $$\\n    BEGIN\\n      INSERT INTO asset_pet_audit (\\"assetPetId\\", \\"assetId\\")\\n      SELECT \\"id\\", \\"assetId\\"\\n      FROM OLD;\\n      RETURN NULL;\\n    END\\n  $$;"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_pet_delete_audit', '{"type":"trigger","name":"pet_delete_audit","sql":"CREATE OR REPLACE TRIGGER \\"pet_delete_audit\\"\\n  AFTER DELETE ON \\"pet\\"\\n  REFERENCING OLD TABLE AS \\"old\\"\\n  FOR EACH STATEMENT\\n  WHEN (pg_trigger_depth() = 0)\\n  EXECUTE FUNCTION pet_delete_audit();"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_pet_updatedAt', '{"type":"trigger","name":"pet_updatedAt","sql":"CREATE OR REPLACE TRIGGER \\"pet_updatedAt\\"\\n  BEFORE UPDATE ON \\"pet\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION updated_at();"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('index_idx_pet_name_trigram', '{"type":"index","name":"idx_pet_name_trigram","sql":"CREATE INDEX \\"idx_pet_name_trigram\\" ON \\"pet\\" USING gin (f_unaccent(\\"name\\") gin_trgm_ops);"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_asset_pet_audit', '{"type":"trigger","name":"asset_pet_audit","sql":"CREATE OR REPLACE TRIGGER \\"asset_pet_audit\\"\\n  AFTER DELETE ON \\"asset_pet\\"\\n  REFERENCING OLD TABLE AS \\"old\\"\\n  FOR EACH STATEMENT\\n  WHEN (pg_trigger_depth() = 0)\\n  EXECUTE FUNCTION asset_pet_audit();"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_asset_pet_updatedAt', '{"type":"trigger","name":"asset_pet_updatedAt","sql":"CREATE OR REPLACE TRIGGER \\"asset_pet_updatedAt\\"\\n  BEFORE UPDATE ON \\"asset_pet\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION updated_at();"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('index_asset_pet_petId_assetId_notDeleted_isVisible_idx', '{"type":"index","name":"asset_pet_petId_assetId_notDeleted_isVisible_idx","sql":"CREATE INDEX \\"asset_pet_petId_assetId_notDeleted_isVisible_idx\\" ON \\"asset_pet\\" (\\"petId\\", \\"assetId\\") WHERE (\\"deletedAt\\" IS NULL AND \\"isVisible\\" IS TRUE);"}'::jsonb);`.execute(db);
  await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('index_pet_index', '{"type":"index","name":"pet_index","sql":"CREATE INDEX \\"pet_index\\" ON \\"pet_search\\" USING hnsw (embedding vector_cosine_ops) WITH (ef_construction = 300, m = 16);"}'::jsonb);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER "pet_delete_audit" ON "pet";`.execute(db);
  await sql`DROP FUNCTION pet_delete_audit;`.execute(db);
  await sql`DROP TRIGGER "asset_pet_audit" ON "asset_pet";`.execute(db);
  await sql`DROP FUNCTION asset_pet_audit;`.execute(db);
  await sql`ALTER TABLE "asset_job_status" DROP COLUMN "petsRecognizedAt";`.execute(db);
  await sql`ALTER TABLE "pet" DROP CONSTRAINT "pet_thumbnailAssetId_fkey";`.execute(db);
  await sql`DROP TABLE "asset_pet_audit";`.execute(db);
  await sql`DROP TABLE "pet_search";`.execute(db);
  await sql`DROP TABLE "asset_pet";`.execute(db);
  await sql`DROP TABLE "pet";`.execute(db);
  await sql`DROP TRIGGER "pet_updatedAt" ON "pet";`.execute(db);
  await sql`DROP TRIGGER "asset_pet_updatedAt" ON "asset_pet";`.execute(db);
  await sql`DROP TABLE "pet_audit";`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'function_pet_delete_audit';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'function_asset_pet_audit';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_pet_delete_audit';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_pet_updatedAt';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'index_idx_pet_name_trigram';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_asset_pet_audit';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_asset_pet_updatedAt';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'index_asset_pet_petId_assetId_notDeleted_isVisible_idx';`.execute(db);
  await sql`DELETE FROM "migration_overrides" WHERE "name" = 'index_pet_index';`.execute(db);
}
