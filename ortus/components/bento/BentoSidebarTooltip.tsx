'use client';

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';

type Props = {
  label: string;
  show: boolean;
  children: ReactElement;
};

const AUTO_HIDE_MS = 2200;

function mergeHandler<A extends unknown[]>(
  theirs: ((...args: A) => void) | undefined,
  ours: (...args: A) => void,
) {
  return (...args: A) => {
    theirs?.(...args);
    ours(...args);
  };
}

/** Rótulo na sidebar colapsada — some sozinho após clique/foco. */
export default function BentoSidebarTooltip({ label, show, children }: Props) {
  const [visible, setVisible] = useState(false);
  const hovering = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const hideUnlessHovering = () => {
    if (hovering.current) return;
    setVisible(false);
  };

  const scheduleAutoHide = () => {
    clearHideTimer();
    hideTimer.current = setTimeout(hideUnlessHovering, AUTO_HIDE_MS);
  };

  useEffect(() => () => clearHideTimer(), []);

  if (!show) return children;

  const props = (isValidElement(children) ? children.props : {}) as Record<string, unknown>;

  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        title: undefined,
        onMouseEnter: mergeHandler(props.onMouseEnter as ((e: MouseEvent) => void) | undefined, () => {
          hovering.current = true;
          clearHideTimer();
          setVisible(true);
        }),
        onMouseLeave: mergeHandler(props.onMouseLeave as ((e: MouseEvent) => void) | undefined, () => {
          hovering.current = false;
          clearHideTimer();
          setVisible(false);
        }),
        onFocus: mergeHandler(props.onFocus as ((e: FocusEvent) => void) | undefined, () => {
          setVisible(true);
          scheduleAutoHide();
        }),
        onBlur: mergeHandler(props.onBlur as ((e: FocusEvent) => void) | undefined, () => {
          scheduleAutoHide();
        }),
        onClick: mergeHandler(props.onClick as ((e: MouseEvent) => void) | undefined, () => {
          setVisible(true);
          scheduleAutoHide();
        }),
      })
    : children;

  return (
    <div className="relative flex w-full justify-center">
      {child}
      <span
        role="tooltip"
        aria-hidden={!visible}
        className={`pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[400] max-w-[14rem] -translate-y-1/2 truncate rounded-full bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-[0_8px_30px_rgba(0,0,0,0.28)] transition-opacity duration-150 ease-out ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
