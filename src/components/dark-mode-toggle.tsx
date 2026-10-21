import React from 'react';

export interface DarkModeToggleProps {
  isDarkMode: boolean;
  onToggle: (e?: any) => void;
  size?: number; // Size em pixels (default: 5.2px para proporção perfeita)
  className?: string;
}

export const DarkModeToggle: React.FC<DarkModeToggleProps> = ({
  isDarkMode,
  onToggle,
  size = 5.2,
  className = '',
}) => {
  return (
    <label
      className={`bb8-toggle ${className}`}
      aria-label={isDarkMode ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
      title={isDarkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
      style={{ '--bb8-size': `${size}px` } as React.CSSProperties}
      onClick={(e) => {
        e.preventDefault(); // Impede o browser de clicar o input novamente (double-fire)
        onToggle(e);
      }}
    >
      <input
        className="bb8-toggle__checkbox"
        type="checkbox"
        checked={isDarkMode}
        onChange={() => {}} // Controlado pelo onClick do label
      />
      <div className="bb8-toggle__container">
        <div className="bb8-toggle__scenery">
          <div className="bb8-toggle__star"></div>
          <div className="bb8-toggle__star"></div>
          <div className="bb8-toggle__star"></div>
          <div className="bb8-toggle__star"></div>
          <div className="bb8-toggle__star"></div>
          <div className="bb8-toggle__star"></div>
          <div className="bb8-toggle__star"></div>
          <div className="tatto-1" aria-hidden="true"></div>
          <div className="tatto-2" aria-hidden="true"></div>
          <div className="gomrassen"></div>
          <div className="hermes"></div>
          <div className="chenini"></div>
          <div className="bb8-toggle__cloud"></div>
          <div className="bb8-toggle__cloud"></div>
          <div className="bb8-toggle__cloud"></div>
        </div>
        <div className="bb8">
          <div className="bb8__head-container">
            <div className="bb8__antenna"></div>
            <div className="bb8__antenna"></div>
            <div className="bb8__head"></div>
          </div>
          <div className="bb8__body"></div>
        </div>
        <div className="artificial__hidden" aria-hidden="true">
          <div className="bb8__shadow"></div>
        </div>
      </div>
    </label>
  );
};

export default React.memo(DarkModeToggle);
