'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { X } from 'lucide-react';

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
};

export default function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Digite e pressione Enter',
  className = '',
}: TagInputProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = (s: string) => s.trim().toLowerCase();
  const alreadyHas = (tag: string) => value.some((t) => normalized(t) === normalized(tag));

  const filteredSuggestions = suggestions.filter(
    (s) =>
      !alreadyHas(s) &&
      normalized(s).includes(normalized(input)) &&
      input.trim().length > 0,
  );

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || alreadyHas(tag)) return;
    onChange([...value, tag]);
    setInput('');
    setShowSuggestions(false);
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredSuggestions.length > 0 && showSuggestions) {
        addTag(filteredSuggestions[0]);
      } else {
        addTag(input);
      }
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className="flex min-h-10 cursor-text flex-wrap gap-1.5 rounded-md border border-neutral-200 bg-white p-2 focus-within:border-neutral-900"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-800"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
              className="p-0.5 text-slate-400 hover:text-rose-500 rounded transition-colors"
              aria-label={`Remover ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1">
          {filteredSuggestions.slice(0, 8).map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(s);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
