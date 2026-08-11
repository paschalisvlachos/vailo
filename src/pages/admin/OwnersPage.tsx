import { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Pencil, Trash2, Mail, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, collectionGroup, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { adminPath } from '../../lib/adminRoutes';
import { formatOwnerRoleLabel, ownerRoleBadgeClass } from '../../lib/adminAccess';
import { useAdminSession } from '../../context/AdminSessionContext';
import { ownersVisibleInCrm } from '../../lib/agentOwners';
import {
  agreementKindLabel,
  formatPartnerAgreementDate,
  ownerRoleToAgreementKind,
  partnerAgreementStatusLabel,
  type PartnerAgreementRecord,
} from '../../lib/partnerAgreement';
import { sendPartnerAgreementInviteCallable } from '../../lib/partnerAgreementCallables';
import { httpsCallableMessage } from '../../lib/callableError';
import AdminPageHeader, {
  AdminButton,
  AdminButtonLink,
  AdminCard,
  AdminEmptyState,
} from '../../components/admin/AdminPageHeader';

interface Owner extends PartnerAgreementRecord {
  id: string;
  fullName: string;
  email: string;
  company: string;
  role: string;
  status: string;
  agentId?: string;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    trial: 'bg-vailo-teal/5 text-vailo-dark border-vailo-teal/10',
  };
  const key = status?.toLowerCase() || '';
  const cls = styles[key] || 'bg-red-50 text-red-800 border-red-100';
  return (
    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border capitalize ${cls}`}>
      {status || 'Unknown'}
    </span>
  );
}

function CountBadge({ count, title }: { count: number; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex min-w-[2rem] justify-center bg-vailo-surface-elevated text-vailo-dark py-1 px-2.5 rounded-full text-sm font-semibold tabular-nums"
    >
      {count}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border ${ownerRoleBadgeClass(role)}`}
    >
      {formatOwnerRoleLabel(role)}
    </span>
  );
}

function AgreementDateHint({ owner }: { owner: Owner }) {
  const [open, setOpen] = useState(false);
  const accepted = owner.partnerAgreementAcceptedAt;
  const invited = owner.partnerAgreementInviteSentAt;

  let detail = '';
  if (accepted) {
    detail = `Accepted ${formatPartnerAgreementDate(accepted)}`;
  } else if (invited) {
    detail = `Invite sent ${formatPartnerAgreementDate(invited)}`;
  }

  if (!detail) return null;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] font-bold leading-none text-gray-500 hover:border-vailo-teal hover:text-vailo-teal"
        aria-label="Agreement date details"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        !
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-2 w-max max-w-[220px] -translate-x-1/2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-lg after:absolute after:-top-1.5 after:left-1/2 after:h-3 after:w-3 after:-translate-x-1/2 after:rotate-45 after:border after:border-gray-200 after:border-b-0 after:border-r-0 after:bg-white"
        >
          {detail}
        </span>
      )}
    </span>
  );
}

function AgreementStatusCell({ owner }: { owner: Owner }) {
  const kind = ownerRoleToAgreementKind(owner.role);
  if (!kind) {
    return <span className="text-sm text-gray-400">—</span>;
  }

  const status = partnerAgreementStatusLabel(owner);
  const accepted = Boolean(owner.partnerAgreementAcceptedAt);

  return (
    <div className="flex items-center gap-1">
      <span
        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
          accepted
            ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
            : owner.partnerAgreementInviteSentAt
              ? 'bg-amber-50 text-amber-800 border-amber-100'
              : 'bg-gray-50 text-gray-600 border-gray-200'
        }`}
      >
        {status}
      </span>
      <AgreementDateHint owner={owner} />
    </div>
  );
}

function AgreementSendButton({
  owner,
  sending,
  onSend,
  className = '',
}: {
  owner: Owner;
  sending: boolean;
  onSend: () => void;
  className?: string;
}) {
  const label = owner.partnerAgreementInviteSentAt ? 'Resend' : 'Send';

  return (
    <AdminButton
      type="button"
      variant="secondary"
      className={`!py-0.5 !px-1.5 !gap-1 !rounded-lg text-[11px] font-semibold whitespace-nowrap ${className}`}
      disabled={sending}
      onClick={onSend}
    >
      {sending ? (
        <>
          <Loader2 size={12} className="animate-spin" /> Sending…
        </>
      ) : (
        <>
          <Mail size={12} /> {label}
        </>
      )}
    </AdminButton>
  );
}

function AgreementColumn({
  owner,
  sending,
  onSend,
}: {
  owner: Owner;
  sending: boolean;
  onSend: () => void;
}) {
  if (!ownerRoleToAgreementKind(owner.role)) {
    return <span className="text-sm text-gray-400">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <AgreementStatusCell owner={owner} />
      <AgreementSendButton owner={owner} sending={sending} onSend={onSend} />
    </div>
  );
}

export default function OwnersPage() {
  const toast = useToast();
  const { profile, isPlatformAdmin, isAgent } = useAdminSession();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [managedPropertyCounts, setManagedPropertyCounts] = useState<Record<string, number>>({});
  const [allocatedTypeCounts, setAllocatedTypeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [sendingInviteOwnerId, setSendingInviteOwnerId] = useState<string | null>(null);

  useEffect(() => {
    const unsubOwners = onSnapshot(collection(db, 'owners'), (snapshot) => {
      setOwners(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Owner[]);
      setLoading(false);
    });

    const unsubProperties = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((d) => {
        const ownerId = d.data().ownerId as string | undefined;
        if (ownerId) counts[ownerId] = (counts[ownerId] || 0) + 1;
      });
      setManagedPropertyCounts(counts);
    });

    const unsubTypes = onSnapshot(collectionGroup(db, 'propertyTypes'), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((d) => {
        const ownerId = d.data().ownerId as string | undefined;
        if (ownerId) counts[ownerId] = (counts[ownerId] || 0) + 1;
      });
      setAllocatedTypeCounts(counts);
    });

    return () => {
      unsubOwners();
      unsubProperties();
      unsubTypes();
    };
  }, []);

  const visibleOwners = useMemo(
    () => ownersVisibleInCrm(profile, owners) as Owner[],
    [profile, owners]
  );

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Delete ${name}?`)) {
      try {
        await deleteDoc(doc(db, 'owners', id));
      } catch (error) {
        console.error('Error deleting owner:', error);
        toast.error('Failed to delete owner.');
      }
    }
  };

  const handleSendAgreementInvite = async (owner: Owner) => {
    const kind = ownerRoleToAgreementKind(owner.role);
    if (!kind) return;

    const resend = Boolean(owner.partnerAgreementInviteSentAt);
    const prompt = resend
      ? `Send another agreement invitation to ${owner.email}? Any previous link will stop working until they accept the new one.`
      : `Send ${agreementKindLabel(kind).toLowerCase()} invitation to ${owner.email}?`;

    if (!window.confirm(prompt)) return;

    setSendingInviteOwnerId(owner.id);
    try {
      const result = await sendPartnerAgreementInviteCallable(owner.id);
      toast.success(`Agreement invitation sent to ${result.email}.`);
    } catch (error) {
      console.error('sendPartnerAgreementInvite:', error);
      toast.error(
        httpsCallableMessage(error, 'Could not send agreement invitation.')
      );
    } finally {
      setSendingInviteOwnerId(null);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading CRM…</div>;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title={isAgent ? 'My owners' : 'Owners CRM'}
        description={
          isAgent
            ? 'Add and manage property owners you allocate to listings on your properties.'
            : 'Manage admins, agents, owners, and excursion providers'
        }
        icon={<Users size={26} />}
        action={
          <AdminButtonLink to={adminPath('/add-owner')} className="w-full sm:w-auto">
            <Plus size={18} /> {isAgent ? 'Add owner' : 'Add user'}
          </AdminButtonLink>
        }
      />

      {visibleOwners.length === 0 ? (
        <AdminEmptyState
          icon={<Users size={32} />}
          title={isAgent ? 'No owners yet' : 'No users yet'}
          description={
            isAgent
              ? 'Add property owners here, then assign them to listings on your properties.'
              : 'Add agents, owners, or excursion providers to assign across your portfolio.'
          }
          action={
            <AdminButtonLink to={adminPath('/add-owner')}>
              <Plus size={18} /> {isAgent ? 'Add owner' : 'Add user'}
            </AdminButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 lg:hidden">
            {visibleOwners.map((owner) => (
              <AdminCard key={owner.id} className="p-4">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-vailo-dark truncate">{owner.fullName}</p>
                    <p className="text-sm text-gray-500 truncate">{owner.email}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <StatusBadge status={owner.status} />
                      {isPlatformAdmin && <RoleBadge role={owner.role} />}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-600">
                      {!isAgent && (
                        <>
                          <span>
                            <strong className="text-vailo-teal">{managedPropertyCounts[owner.id] || 0}</strong>{' '}
                            properties managed
                          </span>
                          <span className="text-gray-300">·</span>
                        </>
                      )}
                      <span>
                        <strong className="text-vailo-gold-muted">{allocatedTypeCounts[owner.id] || 0}</strong>{' '}
                        listings allocated
                      </span>
                    </div>
                    {isPlatformAdmin && ownerRoleToAgreementKind(owner.role) && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <AgreementColumn
                          owner={owner}
                          sending={sendingInviteOwnerId === owner.id}
                          onSend={() => handleSendAgreementInvite(owner)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Link
                      to={adminPath(`/owners/${owner.id}/edit`)}
                      className="p-2 text-gray-400 hover:text-vailo-teal rounded-lg"
                      title="Edit owner"
                    >
                      <Pencil size={17} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(owner.id, owner.fullName)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              </AdminCard>
            ))}
          </div>

          <AdminCard className="hidden lg:block overflow-hidden">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Company</th>
                    {!isAgent && (
                      <th className="text-center" title="Assigned on property (agent / owner)">
                        Properties managed
                      </th>
                    )}
                    <th className="text-center" title="Allocated owner on individual property listings">
                      Listings allocated
                    </th>
                    {isPlatformAdmin && <th>Agreement</th>}
                    {isPlatformAdmin && <th>Role</th>}
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOwners.map((owner) => (
                    <tr key={owner.id}>
                      <td>
                        <div className="font-semibold text-vailo-dark">{owner.fullName}</div>
                        <div className="text-sm text-gray-500">{owner.email}</div>
                      </td>
                      <td>{owner.company || '—'}</td>
                      {!isAgent && (
                        <td className="text-center">
                          <CountBadge
                            count={managedPropertyCounts[owner.id] || 0}
                            title="Properties where this user is assigned agent or owner"
                          />
                        </td>
                      )}
                      <td className="text-center">
                        <CountBadge
                          count={allocatedTypeCounts[owner.id] || 0}
                          title="Property listings where this user is the allocated owner"
                        />
                      </td>
                      {isPlatformAdmin && (
                        <td className="whitespace-nowrap">
                          <AgreementColumn
                            owner={owner}
                            sending={sendingInviteOwnerId === owner.id}
                            onSend={() => handleSendAgreementInvite(owner)}
                          />
                        </td>
                      )}
                      {isPlatformAdmin && (
                        <td>
                          <RoleBadge role={owner.role} />
                        </td>
                      )}
                      <td>
                        <StatusBadge status={owner.status} />
                      </td>
                      <td className="text-right">
                        <Link
                          to={adminPath(`/owners/${owner.id}/edit`)}
                          className="inline-flex p-2 text-gray-400 hover:text-vailo-teal"
                          title="Edit owner"
                        >
                          <Pencil size={17} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(owner.id, owner.fullName)}
                          className="p-2 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminCard>
        </>
      )}
    </div>
  );
}
