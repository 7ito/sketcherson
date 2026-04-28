import { useEffect, useRef, useState } from 'react';
import { GAME_WEB_CONFIG } from '../game';

const SHELL_SKIN_ICONS = GAME_WEB_CONFIG.ui.skin.tokens.icons;

interface ToastProps {
  message: string;
  duration?: number;
  onDismiss: () => void;
}

export function Toast({ message, duration = 5000, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismissRef.current(), 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <div
      className={`toast ${visible ? 'toast-visible' : ''}`}
      role="alert"
    >
      <span>{message}</span>
      <button
        className="toast-close"
        onClick={() => {
          setVisible(false);
          setTimeout(onDismiss, 300);
        }}
        aria-label="Dismiss"
      >
        {SHELL_SKIN_ICONS.close}
      </button>
    </div>
  );
}
