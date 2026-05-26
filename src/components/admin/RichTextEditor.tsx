import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Heading2,
  RemoveFormatting,
  Link2,
} from 'lucide-react';
import { sanitizeLegalHtml } from '../../lib/legalHtml';

export type RichTextEditorHandle = {
  getHtml: () => string;
};

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

type ToolbarButton = {
  icon: ReactNode;
  label: string;
  command: string;
  value?: string;
};

const TOOLBAR: ToolbarButton[] = [
  { icon: <Bold size={16} />, label: 'Bold', command: 'bold' },
  { icon: <Italic size={16} />, label: 'Italic', command: 'italic' },
  { icon: <Underline size={16} />, label: 'Underline', command: 'underline' },
  { icon: <Strikethrough size={16} />, label: 'Strikethrough', command: 'strikeThrough' },
  { icon: <Heading2 size={16} />, label: 'Heading', command: 'formatBlock', value: 'h2' },
  { icon: <List size={16} />, label: 'Bullet list', command: 'insertUnorderedList' },
  { icon: <ListOrdered size={16} />, label: 'Numbered list', command: 'insertOrderedList' },
  { icon: <RemoveFormatting size={16} />, label: 'Clear formatting', command: 'removeFormat' },
];

const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  { value, onChange, placeholder, minHeight = 280 },
  ref
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);

  const readHtml = useCallback(() => {
    const el = editorRef.current;
    if (!el) return '';
    return sanitizeLegalHtml(el.innerHTML);
  }, []);

  const syncFromDom = useCallback(() => {
    const html = readHtml();
    lastEmitted.current = html;
    onChange(html);
  }, [onChange, readHtml]);

  useImperativeHandle(ref, () => ({
    getHtml: readHtml,
  }));

  const runCommand = (command: string, commandValue?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, commandValue ?? undefined);
    syncFromDom();
  };

  const insertLink = () => {
    const url = window.prompt('Link URL (https://…)');
    if (!url?.trim()) return;
    runCommand('createLink', url.trim());
  };

  const ensureBlockWrapper = () => {
    const el = editorRef.current;
    if (!el || el.innerHTML.trim()) return;
    el.innerHTML = '<p><br></p>';
  };

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastEmitted.current) return;
    el.innerHTML = value || '';
    lastEmitted.current = value;
    if (!value) ensureBlockWrapper();
  }, [value]);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-vailo-teal/20 focus-within:border-vailo-teal/40 transition-shadow">
      <div
        className="flex flex-wrap items-center gap-0.5 px-2 py-2 border-b border-gray-100 bg-vailo-surface-elevated/80"
        role="toolbar"
        aria-label="Formatting"
      >
        {TOOLBAR.map((btn) => (
          <button
            key={btn.label}
            type="button"
            title={btn.label}
            aria-label={btn.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand(btn.command, btn.value)}
            className="p-2 rounded-lg text-gray-600 hover:text-vailo-teal hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
          >
            {btn.icon}
          </button>
        ))}
        <button
          type="button"
          title="Insert link"
          aria-label="Insert link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertLink}
          className="p-2 rounded-lg text-gray-600 hover:text-vailo-teal hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
        >
          <Link2 size={16} />
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        suppressContentEditableWarning
        onFocus={ensureBlockWrapper}
        onInput={syncFromDom}
        onBlur={syncFromDom}
        data-placeholder={placeholder}
        className="rich-text-editor px-4 py-3 text-sm text-vailo-dark leading-relaxed outline-none overflow-y-auto"
        style={{ minHeight }}
      />
    </div>
  );
});

export default RichTextEditor;
