import {
  createElement,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Platform } from 'react-native';

import { useTheme } from '../styles/useTheme';

interface TooltipProps {
  title: string;
  children: ReactNode;
  /** Hover delay before the tooltip appears, in ms. */
  delayMs?: number;
  /** Extra wrapper style — e.g. position/inset for absolutely-positioned children. */
  style?: CSSProperties;
}

const DEFAULT_DELAY_MS = 150;

export function Tooltip({
  title,
  children,
  delayMs = DEFAULT_DELAY_MS,
  style,
}: TooltipProps) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <TooltipWeb title={title} delayMs={delayMs} style={style}>
      {children}
    </TooltipWeb>
  );
}

interface Coords {
  top: number;
  left: number;
  placement: 'above' | 'below';
}

function TooltipWeb({
  title,
  children,
  delayMs,
  style,
}: {
  title: string;
  children: ReactNode;
  delayMs: number;
  style?: CSSProperties;
}) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  const computeAndShow = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: Coords['placement'] = spaceBelow < 48 ? 'above' : 'below';
    setCoords({
      top: placement === 'below' ? rect.bottom + 6 : rect.top - 6,
      left: rect.left + rect.width / 2,
      placement,
    });
  }, []);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(computeAndShow, delayMs);
  }, [computeAndShow, delayMs]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCoords(null);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const wrapperStyle: CSSProperties = {
    display: 'inline-flex',
    position: 'relative',
    ...style,
  };

  return createElement(
    'div',
    {
      ref: triggerRef,
      onMouseEnter: show,
      onMouseLeave: hide,
      style: wrapperStyle,
    },
    children,
    coords ? createPortal(<TooltipPopup title={title} coords={coords} />, document.body) : null,
  );
}

function TooltipPopup({ title, coords }: { title: string; coords: Coords }) {
  const theme = useTheme();
  // Mount at opacity 0, then flip on the next frame so the CSS transition runs.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const lift = coords.placement === 'above' ? 3 : -3;
  const style: CSSProperties = {
    position: 'fixed',
    top: coords.top,
    left: coords.left,
    transform:
      coords.placement === 'above'
        ? `translate(-50%, -100%) translateY(${shown ? 0 : lift}px)`
        : `translate(-50%, 0) translateY(${shown ? 0 : lift}px)`,
    opacity: shown ? 1 : 0,
    transition: 'opacity 120ms ease-out, transform 120ms ease-out',
    padding: '4px 8px',
    // Inverted colors: the strongest text tone as the surface guarantees the
    // tip stands out against any theme, light or dark, without extra chrome.
    background: theme.colors.textPrimary,
    color: theme.colors.background,
    borderRadius: Math.min(theme.radius.control, 8),
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    fontSize: 11,
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 99999,
  };
  return <div style={style}>{title}</div>;
}
