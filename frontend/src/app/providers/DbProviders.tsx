'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { RxDatabase, RxCollection } from 'rxdb';
import { initDatabase } from '@/lib/rxdb/database';
import type { WorkspaceItem } from '@/src/types/workspaces';
import type { SubmissionListItem } from '@/src/types/submissions';
import type { SubmissionDataDocument } from '@/lib/rxdb/schemas/submissionDataSchema';

export type ChefsDatabase = RxDatabase<{
  workspaces: RxCollection<WorkspaceItem>;
  submissions: RxCollection<SubmissionListItem>;
  submissionData: RxCollection<SubmissionDataDocument>;
}>;

const RxDbContext = createContext<ChefsDatabase | null>(null);

export function RxDbProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [db, setDb] = useState<ChefsDatabase | null>(null);

  useEffect(() => {
    let active = true;

    initDatabase().then((database) => {
      if (active && database) {
        setDb(database);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return <RxDbContext.Provider value={db}>{children}</RxDbContext.Provider>;
}

export function useRxDb() {
  const context = useContext(RxDbContext);
  return context;
}
