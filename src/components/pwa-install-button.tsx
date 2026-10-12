import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        aria-label="Instalar aplicativo PWA"
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[color:var(--c-bg-272420)] text-[color:var(--c-fg-f3efe6)] border border-[color:var(--c-bg-3b3831)] hover:bg-[color:var(--c-bg-322e28)] hover:border-[#d97757]/40 active:scale-[0.99] transition text-xs font-medium cursor-pointer shadow-xs"
      >
        <Download className="w-4 h-4 text-[color:var(--c-fg-d97757)]" />
        <span>Instalar App no Celular</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          aria-label="Instalar app no iOS"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[color:var(--c-bg-272420)] text-[color:var(--c-fg-f3efe6)] border border-[color:var(--c-bg-3b3831)] hover:bg-[color:var(--c-bg-322e28)] hover:border-[#d97757]/40 active:scale-[0.99] transition text-xs font-medium cursor-pointer shadow-xs"
        >
          <Smartphone className="w-4 h-4 text-[color:var(--c-fg-d97757)]" />
          <span>Instalar no iPhone / iPad</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-[color:var(--c-bg-23211d)] border border-[color:var(--c-bg-3b3831)] p-6 shadow-2xl">
              <h3 className="text-base font-semibold text-[color:var(--c-fg-f3efe6)] tracking-tight">Instalar no iPhone / iPad</h3>
              <p className="mt-3 text-xs text-[color:var(--c-fg-a39d93)] leading-relaxed">
                1. Toque no botão <strong className="text-[color:var(--c-fg-f3efe6)]">Compartilhar</strong> (quadrado com seta para cima) na barra do Safari.<br /><br />
                2. Role para baixo e selecione <strong className="text-[color:var(--c-fg-f3efe6)]">Adicionar à Tela de Início</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-[#d97757] hover:bg-[#c96442] py-2.5 text-xs font-medium text-white transition-all cursor-pointer shadow-sm"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
