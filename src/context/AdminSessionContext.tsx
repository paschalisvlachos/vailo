import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  collectionGroup,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import {
  buildAdminScopes,
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
  loading: boolean;
  scopes: AdminScope[];
  activeScope: AdminScope | null;
  setActiveScope: (scope: AdminScope) => void;
  isPlatformAdmin: boolean;
  isScopedUser: boolean;
  isAgent: boolean;
};

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
        setProfileReady(true);
      } else {
        setProfileReady(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUser?.email) {
      setProfile(null);
      setProfileReady(true);
      return;
    }

    const email = normalizeAdminEmail(authUser.email);
    const q = query(collection(db, 'owners'), where('email', '==', email));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setProfile(null);
        } else {
          const doc = snap.docs[0];
          setProfile(parseOwnerProfile(doc.id, doc.data()));
        }
        setProfileReady(true);
      },
      () => {
        setProfile(null);
        setProfileReady(true);
      }
    );
    return () => unsub();
  }, [authUser?.email]);

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
      loading,
      scopes,
      activeScope,
      setActiveScope,
      isPlatformAdmin: isPlatformAdmin(profile),
      isScopedUser: isScopedUser(profile),
      isAgent: isAgent(profile),
    }),
    [authUser, profile, loading, scopes, activeScope, setActiveScope]
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
