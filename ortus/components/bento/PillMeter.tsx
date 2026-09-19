export default function PillMeter({ ratio, accent = 'lime' }: { ratio: number; accent?: 'lime' | 'dark' }) {
  const pct = Math.min(1, Math.max(0, ratio));
  const filled = Math.round(pct * 22);
  const fillClass = accent === 'lime' ? 'bg-neutral-900' : 'bg-[#c8f053]';
  const emptyClass = accent === 'lime' ? 'border border-black/10 bg-white/70' : 'border border-black/10 bg-white/50';

  return (
    <div className="flex items-end gap-1">
      <div className="flex items-end gap-[3px]">
        {Array.from({ length: 22 }).map((_, i) => (
          <span key={i} className={`h-7 w-[6px] rounded-full sm:h-8 sm:w-[7px] ${i < filled ? fillClass : emptyClass}`} />
        ))}
      </div>
      <span className="pb-0.5 text-sm font-medium tabular-nums text-neutral-800 sm:text-base">{Math.round(pct * 100)}%</span>
    </div>
  );
}
