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
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div
        className="flex h-10 shrink-0 cursor-text items-center rounded-md border border-neutral-200 bg-white px-3 focus-within:border-neutral-900"
        onClick={() => inputRef.current?.focus()}
      >
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
          placeholder={placeholder}
          className="h-full w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul className="mt-2 max-h-40 shrink-0 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1">
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
      <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
        {value.map((tag, i) => (
          <li
            key={`${tag}-${i}`}
            className="flex items-center justify-between gap-2 rounded-md border border-neutral-100 bg-neutral-50 px-2.5 py-1.5"
          >
            <span className="min-w-0 truncate text-sm font-medium text-neutral-800">{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="rounded-md p-0.5 text-neutral-400 hover:bg-white hover:text-neutral-900"
              aria-label={`Remover ${tag}`}
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
