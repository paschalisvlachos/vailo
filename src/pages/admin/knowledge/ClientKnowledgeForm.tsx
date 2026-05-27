import { useRef } from 'react';
import { Loader2, Save, Sparkles } from 'lucide-react';
import {
  AdminBadge,
  AdminButton,
  AdminInput,
  AdminLabel,
  AdminSelect,
} from '../../../components/admin/AdminPageHeader';
import RichTextEditor, { type RichTextEditorHandle } from '../../../components/admin/RichTextEditor';
import type { ClientKnowledgeEntry } from '../../../lib/platformKnowledge';

export type ClientKnowledgeFormValues = {
  question: string;
  staffAnswer: string;
  status: ClientKnowledgeEntry['status'];
};

type Props = {
  values: ClientKnowledgeFormValues;
  onChange: (patch: Partial<ClientKnowledgeFormValues>) => void;
  onSave: (payload: {
    question: string;
    staffAnswerHtml: string;
    status: ClientKnowledgeEntry['status'];
  }) => void | Promise<void>;
  onGenerate: (payload: {
    question: string;
    staffAnswerHtml: string;
  }) => void | Promise<void>;
  saving?: boolean;
  generating?: boolean;
  saveLabel?: string;
  showStatus?: boolean;
};

export default function ClientKnowledgeForm({
  values,
  onChange,
  onSave,
  onGenerate,
  saving = false,
  generating = false,
  saveLabel = 'Save',
  showStatus = true,
}: Props) {
  const editorRef = useRef<RichTextEditorHandle>(null);

  const flushSave = () => {
    const staffAnswerHtml = editorRef.current?.getHtml() ?? values.staffAnswer;
    onChange({ staffAnswer: staffAnswerHtml });
    void onSave({
      question: values.question,
      staffAnswerHtml,
      status: values.status,
    });
  };

  const flushGenerate = () => {
    const staffAnswerHtml = editorRef.current?.getHtml() ?? values.staffAnswer;
    onChange({ staffAnswer: staffAnswerHtml });
    void onGenerate({
      question: values.question,
      staffAnswerHtml,
    });
  };

  return (
    <div className="space-y-4">
      {showStatus && (
        <div className="flex flex-wrap items-center gap-3">
          <AdminBadge variant={values.status === 'ready' ? 'teal' : 'gold'}>
            {values.status === 'ready' ? 'Ready for training' : 'Draft'}
          </AdminBadge>
          <AdminSelect
            value={values.status}
            onChange={(e) =>
              onChange({
                status: e.target.value === 'ready' ? 'ready' : 'draft',
              })
            }
            className="w-auto min-w-[10rem]"
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready for training</option>
          </AdminSelect>
        </div>
      )}

      <div>
        <AdminLabel>Client question</AdminLabel>
        <AdminInput
          value={values.question}
          onChange={(e) => onChange({ question: e.target.value })}
          placeholder="e.g. Why should I buy Vailo instead of telling guests to use ChatGPT?"
        />
      </div>

      <div>
        <AdminLabel>Staff answer (approved training text)</AdminLabel>
        <RichTextEditor
          ref={editorRef}
          value={values.staffAnswer}
          onChange={(html) => onChange({ staffAnswer: html })}
          placeholder="Final answer your team should use…"
          minHeight={220}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <AdminButton type="button" variant="secondary" onClick={flushGenerate} disabled={generating}>
          {generating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} className="mr-1.5" />
          )}
          Generate with AI
        </AdminButton>
        <AdminButton type="button" onClick={flushSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} className="mr-1.5" />}
          {saveLabel}
        </AdminButton>
      </div>
    </div>
  );
}
