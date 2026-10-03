'use client';

import { useEffect, useState } from 'react';

type Tip = {
  text: string;
  top: number;
  left: number;
  transform: string;
};

const SHOW_DELAY_MS = 40;

function findHost(target: EventTarget | null): HTMLElement | null {
  const start = target instanceof Element ? target : null;
  const el = start?.closest?.('[title], [data-bento-tip]') as HTMLElement | null;
  if (!el || el === document.body || el === document.documentElement) return null;
  return el;
}

function textAlreadyVisible(el: HTMLElement, text: string) {
  const visible = (el.innerText || '').replace(/\s+/g, ' ').trim();
  if (!visible || visible !== text.trim()) return false;
  if (el.scrollWidth > el.clientWidth + 2) return false;
  for (const child of el.querySelectorAll('*')) {
    if (child instanceof HTMLElement && child.scrollWidth > child.clientWidth + 2) return false;
  }
  return true;
}

function place(el: HTMLElement, text: string): Tip {
  const rect = el.getBoundingClientRect();
  const nearLeft = rect.left < 112 && rect.width < 220;
  if (nearLeft) {
    return {
      text,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
      transform: 'translateY(-50%)',
    };
  }
  const above = rect.top > 40;
  const left = Math.min(Math.max(rect.left + rect.width / 2, 16), window.innerWidth - 16);
  return {
    text,
    top: above ? rect.top - 8 : rect.bottom + 8,
    left,
    transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
  };
}

/** Substitui o tooltip nativo do navegador pelo balão branco da sidebar. */
export default function BentoHoverTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let saved = '';
    let observer: MutationObserver | null = null;
    let showTimer: number | null = null;

    const release = () => {
      observer?.disconnect();
      observer = null;
      if (current && saved && current.isConnected) {
        current.setAttribute('title', saved);
        delete current.dataset.bentoTip;
      }
      current = null;
      saved = '';
      setTip(null);
    };

    const arm = (el: HTMLElement) => {
      const text = (el.getAttribute('title') || el.dataset.bentoTip || '').trim();
      if (!text || textAlreadyVisible(el, text)) {
        if (current && current !== el) release();
        return;
      }
      if (current && current !== el) release();
      saved = text;
      current = el;
      el.dataset.bentoTip = text;
      el.removeAttribute('title');
      observer = new MutationObserver(() => {
        const back = el.getAttribute('title');
        if (back) {
          el.dataset.bentoTip = back;
          saved = back;
          el.removeAttribute('title');
        }
      });
      observer.observe(el, { attributes: true, attributeFilter: ['title'] });
      setTip(place(el, text));
    };

    const stillOver = (target: EventTarget | null) =>
      !!current && target instanceof Node && (target === current || current.contains(target));

    const onOver = (event: MouseEvent) => {
      const el = findHost(event.target);
      if (!el) {
        if (current && !stillOver(event.target)) release();
        return;
      }
      if (el === current) return;
      if (showTimer) window.clearTimeout(showTimer);
      showTimer = window.setTimeout(() => {
        showTimer = null;
        if (!el.isConnected) return;
        arm(el);
      }, SHOW_DELAY_MS);
    };

    const onOut = (event: MouseEvent) => {
      const host = current || findHost(event.target);
      const related = event.relatedTarget;
      if (host && related instanceof Node && host.contains(related)) return;
      if (showTimer) {
        window.clearTimeout(showTimer);
        showTimer = null;
      }
      if (!current) return;
      if (!stillOver(related)) release();
    };

    const onMove = (event: PointerEvent) => {
      if (showTimer && !findHost(event.target)) {
        window.clearTimeout(showTimer);
        showTimer = null;
      }
      if (!current || stillOver(event.target)) return;
      release();
    };

    const onDown = () => {
      if (showTimer) {
        window.clearTimeout(showTimer);
        showTimer = null;
      }
      if (current) release();
    };

    const onScroll = () => {
      if (current && saved) setTip(place(current, saved));
    };

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('blur', release);
    return () => {
      if (showTimer) window.clearTimeout(showTimer);
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('blur', release);
      release();
    };
  }, []);

  if (!tip) return null;
  const long = tip.text.length > 42;

  return (
    <div
      role="tooltip"
      className={`pointer-events-none fixed z-[10000] max-w-[16rem] bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-[0_8px_30px_rgba(0,0,0,0.28)] ${
        long ? 'whitespace-normal rounded-2xl' : 'truncate rounded-full'
      }`}
      style={{ top: tip.top, left: tip.left, transform: tip.transform }}
    >
      {tip.text}
    </div>
  );
}
