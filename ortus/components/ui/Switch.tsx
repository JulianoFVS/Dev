import type { ReactNode } from 'react';

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
};

export default function Switch({ checked, onChange, disabled = false, className = '', children }: SwitchProps) {
  return (
    <label className={`inline-flex shrink-0 items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} ${className}`}>
      {children}
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="block h-5 w-9 rounded-full bg-neutral-300 transition-colors duration-200 peer-checked:bg-neutral-900 peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400" />
        <span className="absolute left-0.5 top-0.5 h-[15.5px] w-[15.5px] rounded-full bg-white transition-transform duration-200 ease-out peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
