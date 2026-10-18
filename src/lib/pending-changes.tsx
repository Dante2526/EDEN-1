import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { get, set } from 'idb-keyval';
import { PendingChange, ChangeType } from './types';
import { normalizeRepoPath } from './file-patcher';

const PENDING_CHANGES_KEY = 'synap_pending_changes';

export async function loadPendingChangesFromDb(): Promise<PendingChange[]> {
  try {
    const data = await get<PendingChange[]>(PENDING_CHANGES_KEY);
    return data || [];
  } catch (err) {
    console.error('Failed to load pending changes from IndexedDB:', err);
    return [];
  }
}

export async function savePendingChangesToDb(changes: PendingChange[]): Promise<void> {
  try {
    await set(PENDING_CHANGES_KEY, changes);
  } catch (err) {
    console.error('Failed to save pending changes to IndexedDB:', err);
  }
}

interface PendingChangesContextType {
  changes: PendingChange[];
  loading: boolean;
  addChange: (change: {
    path: string;
    repo: string;
    branch: string;
    type: ChangeType;
    originalContent?: string;
    newContent: string;
  }) => Promise<PendingChange>;
  discardChange: (id: string) => Promise<void>;
  discardAll: (repo: string, branch: string) => Promise<void>;
  stageChange: (id: string) => Promise<void>;
  unstageChange: (id: string) => Promise<void>;
  stageAll: (repo: string, branch: string) => Promise<void>;
  unstageAll: (repo: string, branch: string) => Promise<void>;
  updateChangeContent: (id: string, newContent: string) => Promise<void>;
  clearCommitted: (committedChanges: PendingChange[]) => Promise<void>;
  getChangesForRepo: (repo: string, branch: string) => PendingChange[];
  /**
   * Migra alterações pendentes de um repo/branch antigo para um novo.
   * Usado quando o usuário cria um repo novo e quer levar as alterações
   * que vinha acumulando "sem repo" (ou de outro repo) para o novo.
   * Atualiza repo + branch de cada change mantendo staged/content.
   */
  migrateChangesToRepo: (
    fromRepoFullName: string | null,
    fromBranch: string | null,
    toRepoFullName: string,
    toBranch: string
  ) => Promise<number>;
}

const PendingChangesContext = createContext<PendingChangesContextType | null>(null);

export const PendingChangesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [loading, setLoading] = useState(true);

  // Load from IndexedDB on initial mount
  useEffect(() => {
    let mounted = true;
    loadPendingChangesFromDb().then((loaded) => {
      if (mounted) {
        setChanges(loaded);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const persistAndSet = useCallback((updater: (prev: PendingChange[]) => PendingChange[]) => {
    setChanges((prev) => {
      const next = updater(prev);
      savePendingChangesToDb(next);
      return next;
    });
  }, []);

  const addChange = useCallback(
    async (params: {
      path: string;
      repo: string;
      branch: string;
      type: ChangeType;
      originalContent?: string;
      newContent: string;
    }): Promise<PendingChange> => {
      const cleanPath = normalizeRepoPath(params.path);
      const newId = `change_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const newChange: PendingChange = {
        id: newId,
        path: cleanPath,
        repo: params.repo,
        branch: params.branch,
        type: params.type,
        originalContent: params.originalContent,
        newContent: params.newContent,
        createdAt: Date.now(),
        staged: false,
      };

      persistAndSet((prev) => {
        // If change for same normalized path, repo, branch already exists, update it while preserving stage state
        const existingIdx = prev.findIndex(
          (c) =>
            c.repo === params.repo &&
            c.branch === params.branch &&
            normalizeRepoPath(c.path) === cleanPath
        );
        if (existingIdx !== -1) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            path: cleanPath,
            type: params.type,
            newContent: params.newContent,
            originalContent:
              params.originalContent !== undefined
                ? params.originalContent
                : updated[existingIdx].originalContent,
          };
          return updated;
        }
        return [newChange, ...prev];
      });

      return newChange;
    },
    [persistAndSet]
  );

  const discardChange = useCallback(
    async (id: string) => {
      persistAndSet((prev) => prev.filter((c) => c.id !== id));
    },
    [persistAndSet]
  );

  const discardAll = useCallback(
    async (repo: string, branch: string) => {
      persistAndSet((prev) => prev.filter((c) => !(c.repo === repo && c.branch === branch)));
    },
    [persistAndSet]
  );

  const stageChange = useCallback(
    async (id: string) => {
      persistAndSet((prev) =>
        prev.map((c) => (c.id === id ? { ...c, staged: true } : c))
      );
    },
    [persistAndSet]
  );

  const unstageChange = useCallback(
    async (id: string) => {
      persistAndSet((prev) =>
        prev.map((c) => (c.id === id ? { ...c, staged: false } : c))
      );
    },
    [persistAndSet]
  );

  const stageAll = useCallback(
    async (repo: string, branch: string) => {
      persistAndSet((prev) =>
        prev.map((c) => (c.repo === repo && c.branch === branch ? { ...c, staged: true } : c))
      );
    },
    [persistAndSet]
  );

  const unstageAll = useCallback(
    async (repo: string, branch: string) => {
      persistAndSet((prev) =>
        prev.map((c) => (c.repo === repo && c.branch === branch ? { ...c, staged: false } : c))
      );
    },
    [persistAndSet]
  );

  const updateChangeContent = useCallback(
    async (id: string, newContent: string) => {
      persistAndSet((prev) =>
        prev.map((c) => (c.id === id ? { ...c, newContent } : c))
      );
    },
    [persistAndSet]
  );

  const clearCommitted = useCallback(
    async (committedChanges: PendingChange[]) => {
      const idsToRemove = new Set(committedChanges.map((c) => c.id));
      persistAndSet((prev) => prev.filter((c) => !idsToRemove.has(c.id)));
    },
    [persistAndSet]
  );

  const getChangesForRepo = useCallback(
    (repo: string, branch: string) => {
      return changes.filter((c) => c.repo === repo && c.branch === branch);
    },
    [changes]
  );

  const migrateChangesToRepo = useCallback(
    async (
      fromRepoFullName: string | null,
      fromBranch: string | null,
      toRepoFullName: string,
      toBranch: string
    ): Promise<number> => {
      let migratedCount = 0;
      persistAndSet((prev) => {
        const next = prev.map((c) => {
          // Se fromRepoFullName === null, migra TODAS as changes "órfãs" (sem repo ou com repo vazio)
          // Caso contrário, só migra as que batem com fromRepoFullName + fromBranch
          const matches =
            (fromRepoFullName === null || c.repo === fromRepoFullName) &&
            (fromBranch === null || c.branch === fromBranch);
          if (!matches) return c;
          migratedCount++;
          return { ...c, repo: toRepoFullName, branch: toBranch };
        });
        return next;
      });
      return migratedCount;
    },
    [persistAndSet]
  );

  return (
    <PendingChangesContext.Provider
      value={{
        changes,
        loading,
        addChange,
        discardChange,
        discardAll,
        stageChange,
        unstageChange,
        stageAll,
        unstageAll,
        updateChangeContent,
        clearCommitted,
        getChangesForRepo,
        migrateChangesToRepo,
      }}
    >
      {children}
    </PendingChangesContext.Provider>
  );
};

export function usePendingChanges() {
  const context = useContext(PendingChangesContext);
  if (!context) {
    throw new Error('usePendingChanges must be used within a PendingChangesProvider');
  }
  return context;
}
