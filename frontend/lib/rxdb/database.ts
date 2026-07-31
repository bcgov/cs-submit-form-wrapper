import { createRxDatabase, addRxPlugin } from 'rxdb';
import type { ChefsDatabase } from '@/src/app/providers/DbProviders';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'; // or getRxStorageMemory for SSR fallback
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { workspaceSchema } from './schemas/workspaceSchema';
import { submissionSchema } from './schemas/submissionSchema';
import { submissionDataSchema } from './schemas/submissionDataSchema';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { submissionMigrations, submissionDataMigrations, workspaceMigrations } from './migrations';

addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBMigrationSchemaPlugin);

let dbPromise: Promise<ChefsDatabase> | null = null;
let devModeAdded = false;

export async function initDatabase() {
  if (typeof window === 'undefined') {
    return null;
  }

  //??= means only set if it's null or undefined. Otherwise skips
  dbPromise ??= (async () => {
    if (process.env.NODE_ENV === 'development' && !devModeAdded) {
      const m = await import('rxdb/plugins/dev-mode');
      m.disableWarnings();
      addRxPlugin(m.RxDBDevModePlugin);
      devModeAdded = true;
    }

    const baseStorage = getRxStorageDexie();
    const storage =
      process.env.NODE_ENV === 'development'
        ? (await import('rxdb/plugins/validate-ajv')).wrappedValidateAjvStorage({
            storage: baseStorage,
          })
        : baseStorage;

    const db = await createRxDatabase({
      name: 'chefs_rxdb_store',
      storage, // Wrapped in development for schema validation
      ignoreDuplicate: true, // Solves Next.js HMR re-init issues in development
    });

    await db.addCollections({
      workspaces: {
        schema: workspaceSchema,
        migrationStrategies: workspaceMigrations,
      },
      submissions: {
        schema: submissionSchema,
        migrationStrategies: submissionMigrations,
      },
      submissionData: {
        schema: submissionDataSchema,
        migrationStrategies: submissionDataMigrations,
      },
    });

    const collections = [db.workspaces, db.submissions, db.submissionData];
    for (const col of collections) {
      col.preInsert((plainData) => {
        if (plainData.serverSynced !== true) {
          plainData.serverSynced = false;
        }
      }, false);
      col.preSave((plainData) => {
        if (plainData.serverSynced !== true) {
          plainData.serverSynced = false;
        }
      }, false);
    }

    return db as unknown as ChefsDatabase;
  })();

  return dbPromise;
}
