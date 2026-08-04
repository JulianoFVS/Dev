'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { conteudoToEditorHtml, editorHtmlToConteudo } from '@/lib/documentVariables';

export type DocumentoVariavelEditorHandle = {
  insertVariable: (label: string) => void;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
};

const DocumentoVariavelEditor = forwardRef<DocumentoVariavelEditorHandle, Props>(
  function DocumentoVariavelEditor({ value, onChange, className = '', placeholder }, ref) {
    const editorRef = useRef<HTMLDivElement>(null);
    const syncing = useRef(false);

    useEffect(() => {
      const el = editorRef.current;
      if (!el || syncing.current) return;
      const html = conteudoToEditorHtml(value);
      if (el.innerHTML !== html) el.innerHTML = html || '';
    }, [value]);

    function emitChange() {
      const el = editorRef.current;
      if (!el) return;
      syncing.current = true;
      onChange(editorHtmlToConteudo(el));
      requestAnimationFrame(() => { syncing.current = false; });
    }

    function insertVariable(label: string) {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      const chip = document.createElement('span');
      chip.className = 'doc-var-chip inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md bg-purple-100 text-purple-800 text-xs font-bold border border-purple-200 select-none align-middle';
      chip.contentEditable = 'false';
      chip.dataset.label = label;
      chip.textContent = label;

      if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(chip);
        range.setStartAfter(chip);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        el.appendChild(chip);
      }
      emitChange();
    }

    useImperativeHandle(ref, () => ({ insertVariable }));

    return (
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          className={`w-full min-h-[12rem] p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 text-sm leading-relaxed whitespace-pre-wrap empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 ${className}`}
          data-placeholder={placeholder || 'Digite o texto do modelo...'}
        />
      </div>
    );
  },
);

export default DocumentoVariavelEditor;
