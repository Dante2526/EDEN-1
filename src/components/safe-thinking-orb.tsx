import React from 'react';
import { ThinkingOrb } from 'thinking-orbs';

interface SafeThinkingOrbProps {
  state?: 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping' | string;
  size?: number;
  theme?: 'dark' | 'light';
  speed?: number;
  'aria-label'?: string;
}

const VALID_STATES = [
  'working',
  'searching',
  'solving',
  'listening',
  'connecting',
  'weaving',
  'composing',
  'breathing',
  'shaping',
];

export function SafeThinkingOrb({
  state = 'working',
  size = 20,
  theme,
  speed = 1.5,
  'aria-label': ariaLabel,
}: SafeThinkingOrbProps) {
  // Quantize size to valid thinking-orbs presets: 20, 32, or 64
  let safeSize: 20 | 32 | 64 = 20;
  if (typeof size === 'number') {
    if (size >= 48) safeSize = 64;
    else if (size >= 26) safeSize = 32;
    else safeSize = 20;
  }

  const safeState = VALID_STATES.includes(state) ? (state as any) : 'working';

  // Auto-detect theme from DOM if not explicitly passed
  let effectiveTheme: 'dark' | 'light' = 'dark';
  if (theme) {
    effectiveTheme = theme;
  } else if (typeof document !== 'undefined') {
    const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
    effectiveTheme = isDark ? 'dark' : 'light';
  }

  try {
    return (
      <ThinkingOrb
        state={safeState}
        size={safeSize}
        theme={effectiveTheme}
        speed={speed}
        aria-label={ariaLabel}
      />
    );
  } catch (err) {
    console.error('SafeThinkingOrb render fallback caught error:', err);
    return (
      <div
        className="rounded-full bg-[#d97757]/30 animate-pulse shrink-0"
        style={{ width: safeSize, height: safeSize }}
      />
    );
  }
}
