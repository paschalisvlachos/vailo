import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ScrollText } from 'lucide-react';
import { legalContentIsEmpty, sanitizeLegalHtml } from '../lib/legalHtml';
import {
  acceptPartnerAgreementCallable,
  getPartnerAgreementInviteCallable,
} from '../lib/partnerAgreementCallables';
import { formatPartnerAgreementDate } from '../lib/partnerAgreement';
import { httpsCallableMessage } from '../lib/callableError';

export default function PartnerAgreementPage() {
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [agreementLabel, setAgreementLabel] = useState('Partner agreement');
  const [recipientName, setRecipientName] = useState('');
  const [agreementHtml, setAgreementHtml] = useState('');
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('This agreement link is missing or invalid.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await getPartnerAgreementInviteCallable(token);
        if (cancelled) return;
        setRecipientName(payload.recipientName);
        setAgreementLabel(payload.agreementLabel);
        setAgreementHtml(payload.agreementHtml);
        setAlreadyAccepted(payload.alreadyAccepted);
        setAcceptedAt(payload.acceptedAt);
      } catch (err) {
        if (cancelled) return;
        setError(
          httpsCallableMessage(err, 'Could not load this agreement. The link may have expired.')
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const safeHtml = useMemo(() => sanitizeLegalHtml(agreementHtml), [agreementHtml]);
  const isEmpty = legalContentIsEmpty(agreementHtml);

  const handleAccept = async () => {
    if (!token || !checked || submitting || alreadyAccepted) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await acceptPartnerAgreementCallable(token);
      setAcceptedAt(result.acceptedAt);
      setAlreadyAccepted(true);
    } catch (err) {
      setError(httpsCallableMessage(err, 'Could not record your acceptance. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f8] text-[#051F26]">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B4F5C]/10 flex items-center justify-center text-[#0B4F5C]">
            <ScrollText size={20} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#0B4F5C]">Vailo</p>
            <h1 className="font-luxury text-xl font-medium">{agreementLabel}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-gray-500">
            <Loader2 size={22} className="animate-spin text-[#0B4F5C]" />
            Loading agreement…
          </div>
        ) : error && !agreementHtml ? (
          <div className="bg-white rounded-2xl border border-red-100 p-8 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {recipientName && (
              <p className="text-sm text-gray-600">
                Prepared for <strong className="text-[#051F26]">{recipientName}</strong>
              </p>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="font-semibold text-lg">{agreementLabel}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Please read the agreement below. You must accept it to continue your partnership
                  with Vailo.
                </p>
              </div>
              <div className="px-6 py-6 max-h-[52vh] overflow-y-auto text-base text-gray-700 leading-relaxed">
                {isEmpty ? (
                  <p className="text-gray-500 italic">This agreement is not available yet.</p>
                ) : (
                  <div
                    className="legal-document-content"
                    dangerouslySetInnerHTML={{ __html: safeHtml }}
                  />
                )}
              </div>
            </div>

            {alreadyAccepted ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex items-start gap-3">
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-900">Agreement accepted</p>
                  <p className="text-sm text-emerald-800 mt-1">
                    Accepted on {formatPartnerAgreementDate(acceptedAt || undefined)}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-[#0B4F5C] focus:ring-[#0B4F5C]"
                  />
                  <span className="text-sm text-gray-700 leading-relaxed">
                    I have read and agree to the {agreementLabel}. I confirm that I am authorised to
                    accept this agreement on behalf of the partner account associated with this
                    invitation.
                  </span>
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={!checked || submitting || isEmpty}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B4F5C] text-white px-5 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#094652] transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'I agree'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
