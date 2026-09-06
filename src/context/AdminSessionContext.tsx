import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  collectionGroup,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  buildAdminScopes,
  isDeactivatedProfile,
  isPlatformAdmin,
  isScopedUser,
  isAgent,
  normalizeAdminEmail,
  normalizeOwnerRole,
  pathForScope,
  resolveActiveScope,
  scopeKey,
  writeStoredScopeKey,
  type AdminScope,
  type OwnerProfile,
} from '../lib/adminAccess';

type AdminSessionContextValue = {
  authUser: User | null;
  profile: OwnerProfile | null;
  /** Set when the owners profile query fails (e.g. permission / App Check). */
  profileError: string | null;
  loading: boolean;
  scopes: AdminScope[];
  activeScope: AdminScope | null;
  setActiveScope: (scope: AdminScope) => void;
  isPlatformAdmin: boolean;
  isScopedUser: boolean;
  isAgent: boolean;
};

function formatFirestoreError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code || '')
      : '';
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: string }).message || '')
      : String(error || 'Unknown Firestore error');
  if (code.includes('permission-denied') || /permission/i.test(message)) {
    return 'Firestore permission denied while reading Owners CRM. Check App Check enforcement and Firestore rules on this project.';
  }
  if (/app.?check/i.test(message) || code.includes('app-check')) {
    return 'Firebase App Check blocked Owners CRM reads. Disable enforcement on staging or enable App Check for this build.';
  }
  return code ? `${code}: ${message}` : message;
}

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

function parseOwnerProfile(id: string, data: Record<string, unknown>): OwnerProfile {
  return {
    id,
    fullName: typeof data.fullName === 'string' ? data.fullName : '',
    email: typeof data.email === 'string' ? data.email : '',
    role: normalizeOwnerRole(data.role),
    status: typeof data.status === 'string' ? data.status : 'active',
    company: typeof data.company === 'string' ? data.company : undefined,
    agentId: typeof data.agentId === 'string' ? data.agentId : undefined,
  };
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [properties, setProperties] = useState<
    { id: string; propertyName?: string; ownerId?: string }[]
  >([]);
  const [types, setTypes] = useState<
    {
      id: string;
      propertyId: string;
      propertyTypeName?: string;
      ownerId?: string;
    }[]
  >([]);
  const [linkedExcursionProviders, setLinkedExcursionProviders] = useState<
    { id: string; businessName?: string }[]
  >([]);
  const [dataReady, setDataReady] = useState(false);
  const [providersReady, setProvidersReady] = useState(false);
  const [activeScope, setActiveScopeState] = useState<AdminScope | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setProfile(null);
        setProfileError(null);
        setProfileReady(true);
      } else {
        setProfileReady(false);
        setProfileError(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUser) {
      setProfile(null);
      setProfileError(null);
      setProfileReady(true);
      return;
    }

    const email = normalizeAdminEmail(authUser.email);
    const uid = authUser.uid;
    let cancelled = false;
    let emailUnsub: (() => void) | null = null;

    const applySnapshot = (
      snap: { empty: boolean; docs: { id: string; data: () => Record<string, unknown> }[] }
    ) => {
      if (cancelled) return;
      if (snap.empty) {
        setProfile(null);
      } else {
        const match =
          snap.docs.find(
            (docSnap) => normalizeAdminEmail(String(docSnap.data().email)) === email
          ) ?? snap.docs[0];
        setProfile(parseOwnerProfile(match.id, match.data()));
        setProfileError(null);
      }
      setProfileReady(true);
    };

    const listenByEmail = () => {
      if (emailUnsub || !email || cancelled) return;
      const emailQuery = query(collection(db, 'owners'), where('email', '==', email));
      emailUnsub = onSnapshot(
        emailQuery,
        applySnapshot,
        (error) => {
          if (cancelled) return;
          console.error('[admin-session] owners email query failed', error);
          setProfile(null);
          setProfileError(formatFirestoreError(error));
          setProfileReady(true);
        }
      );
    };

    // One-shot lookups first so App Check / permission failures surface immediately.
    void (async () => {
      try {
        const uidSnap = await getDocs(query(collection(db, 'owners'), where('authUid', '==', uid)));
        if (cancelled) return;
        if (!uidSnap.empty) {
          applySnapshot(uidSnap);
          return;
        }
        if (email) {
          const emailSnap = await getDocs(
            query(collection(db, 'owners'), where('email', '==', email))
          );
          if (cancelled) return;
          applySnapshot(emailSnap);
          if (!emailSnap.empty) return;
        } else {
          setProfile(null);
          setProfileReady(true);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('[admin-session] owners profile lookup failed', error);
        setProfile(null);
        setProfileError(formatFirestoreError(error));
        setProfileReady(true);
      }
    })();

    const uidQuery = query(collection(db, 'owners'), where('authUid', '==', uid));
    const unsubUid = onSnapshot(
      uidQuery,
      (snap) => {
        if (!snap.empty) {
          if (emailUnsub) {
            emailUnsub();
            emailUnsub = null;
          }
          applySnapshot(snap);
          return;
        }
        listenByEmail();
      },
      (error) => {
        console.error('[admin-session] owners authUid query failed', error);
        setProfileError(formatFirestoreError(error));
        listenByEmail();
        if (!email) {
          setProfile(null);
          setProfileReady(true);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubUid();
      emailUnsub?.();
    };
  }, [authUser?.uid, authUser?.email]);

  useEffect(() => {
    if (!profileReady || !authUser || !profile) return;
    if (isDeactivatedProfile(profile)) {
      void signOut(auth);
    }
  }, [profileReady, authUser, profile]);

  useEffect(() => {
    if (!authUser) {
      setProperties([]);
      setTypes([]);
      setLinkedExcursionProviders([]);
      setDataReady(true);
      setProvidersReady(true);
      return;
    }

    let propsDone = false;
    let typesDone = false;

    const markReady = () => {
      if (propsDone && typesDone) setDataReady(true);
    };

    const unsubProps = onSnapshot(collection(db, 'properties'), (snap) => {
      setProperties(
        snap.docs.map((d) => ({
          id: d.id,
          propertyName: d.data().propertyName as string | undefined,
          ownerId: d.data().ownerId as string | undefined,
        }))
      );
      propsDone = true;
      markReady();
    });

    const unsubTypes = onSnapshot(collectionGroup(db, 'propertyTypes'), (snap) => {
      setTypes(
        snap.docs.map((d) => ({
          id: d.id,
          propertyId: d.ref.parent.parent?.id || '',
          propertyTypeName: d.data().propertyTypeName as string | undefined,
          ownerId: d.data().ownerId as string | undefined,
        }))
      );
      typesDone = true;
      markReady();
    });

    return () => {
      unsubProps();
      unsubTypes();
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser || profile?.role !== 'excursion_provider' || !profile.id) {
      setLinkedExcursionProviders([]);
      setProvidersReady(true);
      return;
    }

    setProvidersReady(false);
    const q = query(
      collection(db, 'excursionProviders'),
      where('linkedOwnerIds', 'array-contains', profile.id)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLinkedExcursionProviders(
          snap.docs.map((d) => ({
            id: d.id,
            businessName: d.data().businessName as string | undefined,
          }))
        );
        setProvidersReady(true);
      },
      () => {
        setLinkedExcursionProviders([]);
        setProvidersReady(true);
      }
    );
    return () => unsub();
  }, [authUser, profile?.id, profile?.role]);

  const scopes = useMemo(
    () => buildAdminScopes(profile, properties, types, linkedExcursionProviders),
    [profile, properties, types, linkedExcursionProviders]
  );

  useEffect(() => {
    if (!authReady || !profileReady || !dataReady) return;
    if (profile?.role === 'excursion_provider' && !providersReady) return;
    const next = resolveActiveScope(scopes);
    setActiveScopeState(next);
  }, [authReady, profileReady, dataReady, providersReady, profile?.role, scopes]);

  const setActiveScope = useCallback((scope: AdminScope) => {
    writeStoredScopeKey(scopeKey(scope));
    setActiveScopeState(scope);
  }, []);

  const loading =
    !authReady ||
    !profileReady ||
    !dataReady ||
    (profile?.role === 'excursion_provider' && !providersReady);

  const value = useMemo(
    () => ({
      authUser,
      profile,
      profileError,
      loading,
      scopes,
      activeScope,
      setActiveScope,
      isPlatformAdmin: isPlatformAdmin(profile),
      isScopedUser: isScopedUser(profile),
      isAgent: isAgent(profile),
    }),
    [authUser, profile, profileError, loading, scopes, activeScope, setActiveScope]
  );

  return (
    <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>
  );
}

export function useAdminSession(): AdminSessionContextValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error('useAdminSession must be used within AdminSessionProvider');
  }
  return ctx;
}

export function useAdminSessionNavigate() {
  const { setActiveScope } = useAdminSession();
  return (scope: AdminScope) => {
    setActiveScope(scope);
    return pathForScope(scope);
  };
}
