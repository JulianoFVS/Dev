'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/** Largura “desktop” do mock — igual ao canvas interno do preview. */
export const LANDING_PREVIEW_WIDTH = 1280;

type Props = {
  children: React.ReactNode;
};

/**
 * Encolhe a tela inteira (topo → fim) para caber na largura do container,
 * sem cortar altura nem moldura extra.
 */
export default function LandingPreviewScale({ children }: Props) {
  const slotRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.75);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const inner = innerRef.current;
    if (!slot || !inner) return;

    const update = () => {
      const width = slot.clientWidth;
      if (width <= 0) return;
      const nextScale = width / LANDING_PREVIEW_WIDTH;
      const naturalHeight = inner.offsetHeight;
      setScale(nextScale);
      setHeight(Math.ceil(naturalHeight * nextScale));
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(slot);
    ro.observe(inner);

    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={slotRef}
      className="relative w-full select-none [-webkit-font-smoothing:antialiased]"
      style={{ height: height > 0 ? height : 'auto' }}
    >
      <div
        ref={innerRef}
        className="absolute left-1/2 top-0 will-change-transform"
        style={{
          width: LANDING_PREVIEW_WIDTH,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
