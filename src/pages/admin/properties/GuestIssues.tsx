import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { AlertTriangle, Check, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import AdminPageHeader, {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
} from '../../../components/admin/AdminPageHeader';
import type { GuestIssue } from '../../../lib/guestIssues';

function parseIssue(id: string, data: Record<string, unknown>): GuestIssue {
  const createdAt = data.createdAt;
  return {
    id,
    description: typeof data.description === 'string' ? data.description : '',
    aiResponse: typeof data.aiResponse === 'string' ? data.aiResponse : '',
    propertyTypeId: typeof data.propertyTypeId === 'string' ? data.propertyTypeId : '',
    propertyTypeName: typeof data.propertyTypeName === 'string' ? data.propertyTypeName : '',
    seenByHost: data.seenByHost === true,
    resolved: data.resolved === true,
    createdAt:
      createdAt && typeof createdAt === 'object' && 'toDate' in createdAt
        ? (createdAt as { toDate: () => Date }).toDate()
        : null,
  };
}

export default function GuestIssues() {
  const { property, propertyId } = useOutletContext<{
    property: { propertyName?: string };
    propertyId: string;
  }>();
  const toast = useToast();
  const [issues, setIssues] = useState<GuestIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    const q = query(
      collection(db, 'properties', propertyId, 'guestIssues'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setIssues(snapshot.docs.map((d) => parseIssue(d.id, d.data())));
        setLoading(false);
      },
      (err) => {
        console.error('guestIssues listener:', err);
        setIssues([]);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [propertyId]);

  const unseenCount = issues.filter((i) => !i.seenByHost).length;

  const markSeen = async (issueId: string) => {
    try {
      await updateDoc(doc(db, 'properties', propertyId, 'guestIssues', issueId), {
        seenByHost: true,
      });
    } catch (err) {
      console.error('mark seen:', err);
      toast.error('Could not update issue.');
    }
  };

  const markResolved = async (issueId: string) => {
    try {
      await updateDoc(doc(db, 'properties', propertyId, 'guestIssues', issueId), {
        resolved: true,
        seenByHost: true,
      });
      toast.success('Marked as resolved.');
    } catch (err) {
      console.error('mark resolved:', err);
      toast.error('Could not update issue.');
    }
  };

  const markAllSeen = async () => {
    const unseen = issues.filter((i) => !i.seenByHost);
    if (unseen.length === 0) return;
    setMarkingAll(true);
    try {
      const batch = writeBatch(db);
      unseen.forEach((issue) => {
        batch.update(doc(db, 'properties', propertyId, 'guestIssues', issue.id), {
          seenByHost: true,
        });
      });
      await batch.commit();
      toast.success('All issues marked as seen.');
    } catch (err) {
      console.error('mark all seen:', err);
      toast.error('Could not update issues.');
    } finally {
      setMarkingAll(false);
    }
  };

  const toggleExpand = (issue: GuestIssue) => {
    const next = expandedId === issue.id ? null : issue.id;
    setExpandedId(next);
    if (next && !issue.seenByHost) {
      markSeen(issue.id);
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="Guest Issues"
        description={`Reports from guests staying at ${property?.propertyName || 'this property'}`}
        icon={<AlertTriangle size={24} />}
      />

      {unseenCount > 0 && (
        <AdminAlert variant="gold" icon={<AlertTriangle size={18} />} title={`${unseenCount} new issue${unseenCount === 1 ? '' : 's'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>Guests submitted these via Report Issue on the portal.</span>
            <AdminButton variant="secondary" onClick={markAllSeen} disabled={markingAll} className="shrink-0">
              {markingAll ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Mark all seen
            </AdminButton>
          </div>
        </AdminAlert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
          <Loader2 size={20} className="animate-spin text-vailo-teal" />
          Loading issues…
        </div>
      ) : issues.length === 0 ? (
        <AdminEmptyState
          icon={<AlertTriangle size={28} />}
          title="No guest issues yet"
          description="When guests use Report Issue on their portal, submissions will appear here."
        />
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => {
            const isOpen = expandedId === issue.id;
            const isNew = !issue.seenByHost;
            return (
              <AdminCard key={issue.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpand(issue)}
                  className="w-full flex items-start gap-3 p-4 sm:p-5 text-left hover:bg-vailo-surface-elevated/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {isNew && <AdminBadge variant="gold">New</AdminBadge>}
                      {issue.resolved && <AdminBadge variant="teal">Resolved</AdminBadge>}
                      {issue.propertyTypeName && (
                        <span className="text-xs text-gray-500">{issue.propertyTypeName}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-vailo-dark line-clamp-2">{issue.description}</p>
                    {issue.createdAt && (
                      <p className="text-xs text-gray-400 mt-1">{issue.createdAt.toLocaleString()}</p>
                    )}
                  </div>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 sm:px-5 pb-5 pt-0 border-t border-gray-100 space-y-4">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Guest report
                      </p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {issue.description}
                      </p>
                    </div>
                    {issue.aiResponse && (
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Sparkles size={12} className="text-vailo-gold" />
                          AI quick check (shown to guest)
                        </p>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed bg-vailo-surface-elevated rounded-xl p-3 border border-gray-100">
                          {issue.aiResponse}
                        </p>
                      </div>
                    )}
                    {!issue.resolved && (
                      <AdminButton variant="secondary" onClick={() => markResolved(issue.id)}>
                        <Check size={16} />
                        Mark resolved
                      </AdminButton>
                    )}
                  </div>
                )}
              </AdminCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
