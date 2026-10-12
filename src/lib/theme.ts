export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'synap_theme';

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  // Padrão do Synap é dark
  return 'dark';
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;

  if (theme === 'dark') {
    root.classList.add('dark');
    body.classList.add('dark');
  } else {
    root.classList.remove('dark');
    body.classList.remove('dark');
  }

  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');

  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/**
 * Executa a alternância de tema com a View Transition API,
 * disparando uma animação circular expansiva a partir das coordenadas do clique.
 * Duração: 0.55s (550ms) com curva cubic-bezier(0.4, 0, 0.2, 1).
 */
export function toggleThemeWithTransition(
  currentTheme: ThemeMode,
  event?: React.MouseEvent | MouseEvent,
  onApply?: (newTheme: ThemeMode) => void
): ThemeMode {
  const nextTheme: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark';

  const doc = document as any;
  if (
    typeof document === 'undefined' ||
    !doc.startViewTransition ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
    !event
  ) {
    applyTheme(nextTheme);
    onApply?.(nextTheme);
    return nextTheme;
  }

  const x = event.clientX;
  const y = event.clientY;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const transition = doc.startViewTransition(() => {
    applyTheme(nextTheme);
    onApply?.(nextTheme);
  });

  transition.ready?.then(() => {
    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`,
    ];

    document.documentElement.animate(
      {
        clipPath,
      },
      {
        duration: 550,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  });

  return nextTheme;
}
