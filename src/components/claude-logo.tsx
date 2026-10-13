import React from 'react';

interface ClaudeLogoProps {
  className?: string;
  size?: number;
}

/**
 * Claude.ai's iconic 8-pointed starburst / asterisk glyph
 */
export const ClaudeLogo: React.FC<ClaudeLogoProps> = ({ className = 'w-5 h-5 text-[color:var(--c-fg-d97757)]', size }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2a1.5 1.5 0 0 1 1.5 1.5v4.544l3.213-3.213a1.5 1.5 0 0 1 2.121 2.121L15.621 10.17h4.879a1.5 1.5 0 0 1 0 3h-4.88l3.214 3.214a1.5 1.5 0 0 1-2.121 2.121L13.5 15.292V20.5a1.5 1.5 0 0 1-3 0v-5.208l-3.213 3.213a1.5 1.5 0 0 1-2.121-2.121l3.213-3.214H3.5a1.5 1.5 0 0 1 0-3h4.88L5.166 7.056a1.5 1.5 0 0 1 2.121-2.121L10.5 8.148V3.5A1.5 1.5 0 0 1 12 2Z" />
    </svg>
  );
};
