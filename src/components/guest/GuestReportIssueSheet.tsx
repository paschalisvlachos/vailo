import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getGenerativeModel } from 'firebase/ai';
import { X, Loader2, Sparkles } from 'lucide-react';
import { ai, db } from '../../lib/firebase';
import { GUEST_ISSUE_MAX_LENGTH } from '../../lib/guestIssues';

type GuideContext = {
  checkIn?: string;
  rules?: string;
  technical?: string;
  daily?: string;
  emergency?: string;
};

type Props = {
  propertyId: string;
  propertyTypeId: string;
  propertyName: string;
  propertyTypeName: string;
  guide?: GuideContext | null;
  onClose: () => void;
};

function buildGuideContext(guide?: GuideContext | null): string {
  if (!guide) return 'No house guide notes on file.';
  const parts: string[] = [];
  if (guide.checkIn?.trim()) parts.push(`Arrival: ${guide.checkIn.trim()}`);
  if (guide.rules?.trim()) parts.push(`Rules: ${guide.rules.trim()}`);
  if (guide.technical?.trim()) parts.push(`Appliances: ${guide.technical.trim()}`);
  if (guide.daily?.trim()) parts.push(`Daily needs: ${guide.daily.trim()}`);
  if (guide.emergency?.trim()) parts.push(`Emergency: ${guide.emergency.trim()}`);
  return parts.length ? parts.join('\n\n') : 'No house guide notes on file.';
}

export default function GuestReportIssueSheet({
  propertyId,
  propertyTypeId,
  propertyName,
  propertyTypeName,
  guide,
  onClose,
}: Props) {
  const [description, setDescription] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmed = description.trim();
  const charCount = description.length;

  const handleQuickAiCheck = async () => {
    if (!trimmed) {
      setError('Please describe the problem first.');
      return;
    }
    if (trimmed.length > GUEST_ISSUE_MAX_LENGTH) {
      setError(`Please keep your message under ${GUEST_ISSUE_MAX_LENGTH} characters.`);
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const prompt = `You are a helpful 24/7 property concierge for "${propertyName}" — unit "${propertyTypeName}".

HOUSE GUIDE (for context only):
${buildGuideContext(guide)}

GUEST REPORTS THIS PROBLEM:
"${trimmed}"

Give practical immediate steps the guest can try right now (2–4 short paragraphs). Be calm and clear. If it sounds like an emergency (fire, gas, medical), tell them to call local emergency services first, then the host.
Return plain text only — no markdown.`;

      const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();

      await addDoc(collection(db, 'properties', propertyId, 'guestIssues'), {
        description: trimmed,
        aiResponse: responseText,
        propertyTypeId,
        propertyTypeName,
        propertyName,
        seenByHost: false,
        resolved: false,
        createdAt: serverTimestamp(),
      });

      setAiResponse(responseText);
      setSaved(true);
    } catch (err) {
      console.error('Quick AI Check failed:', err);
      setError('Could not send your report. Please try again in a moment.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-[#051F26]/55 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-issue-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 id="report-issue-title" className="font-luxury text-xl text-[#051F26] font-medium">
              Report an Issue
            </h2>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Describe the problem and I&apos;ll try to help you immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-gray-50 shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 flex-1">
          {!saved ? (
            <>
              <label htmlFor="issue-description" className="block text-sm font-semibold text-[#051F26] mb-2">
                What&apos;s the problem?
              </label>
              <textarea
                id="issue-description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value.slice(0, GUEST_ISSUE_MAX_LENGTH));
                  setError(null);
                }}
                rows={5}
                placeholder="e.g., The hot water isn't working in the master bathroom..."
                disabled={isChecking}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10 resize-y min-h-[120px]"
              />
              <p className="text-right text-xs text-gray-400 mt-1.5 tabular-nums">
                {charCount}/{GUEST_ISSUE_MAX_LENGTH}
              </p>
              {error && (
                <p className="text-sm text-red-600 mt-3" role="alert">
                  {error}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 text-sm">
                <Sparkles size={16} className="shrink-0" />
                <span>
                  Your host has been notified and will contact you ASAP. Here&apos;s what you can try now
                </span>
              </div>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap border-l-2 border-[#C5A059]/50 pl-3">
                {aiResponse}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0 bg-gray-50/80">
          {!saved ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isChecking}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleQuickAiCheck}
                disabled={isChecking || !trimmed}
                className="flex-1 py-3 rounded-xl bg-[#0B4F5C] text-[#C5A059] text-sm font-bold hover:bg-[#083a43] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isChecking ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending…
                  </>
                ) : (
                  'Send to Host'
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#0B4F5C] text-white text-sm font-bold hover:bg-[#083a43] transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
