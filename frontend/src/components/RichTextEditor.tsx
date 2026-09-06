"use client";

import { useRef } from "react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

interface ToolbarButton {
  label: string;
  command: string;
  value?: string;
}

const toolbarGroups: ToolbarButton[][] = [
  [
    { label: "↶", command: "undo" },
    { label: "↷", command: "redo" },
  ],
  [
    { label: "B", command: "bold" },
    { label: "I", command: "italic" },
    { label: "U", command: "underline" },
  ],
  [
    { label: "≡", command: "justifyLeft" },
    { label: "↕", command: "justifyCenter" },
  ],
  [
    { label: "•", command: "insertUnorderedList" },
    { label: "1.", command: "insertOrderedList" },
    { label: "⇥", command: "indent" },
  ],
  [
    { label: "❝", command: "formatBlock", value: "blockquote" },
    { label: "S̶", command: "strikeThrough" },
  ],
];

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">Body</span>
      <div className="rounded-lg border border-slate-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
          data-placeholder={placeholder}
          className="min-h-[140px] px-3 py-2 text-sm outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]"
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-1.5">
          {toolbarGroups.map((group, i) => (
            <div key={i} className="flex items-center gap-1 border-r border-slate-200 pr-2 last:border-none">
              {group.map((btn) => (
                <button
                  key={btn.command + (btn.value ?? "")}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => exec(btn.command, btn.value)}
                  className="flex h-6 w-6 items-center justify-center rounded text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  title={btn.command}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
