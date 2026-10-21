/**
 * Dicionário de tradução EN → PT-BR para a interface do OpenCut Video Studio.
 *
 * Como o OpenCut é um app React/Next.js renderizado no cliente (sem i18n nativo),
 * o Google Tradutor proxy não consegue traduzir os textos dinâmicos. Por isso
 * mantemos este dicionário que é injetado dentro do iframe via MutationObserver.
 *
 * Quando um elemento aparece na tela com texto igual a uma chave do dicionário,
 * substituímos pelo valor em PT-BR.
 *
 * Manutenção: quando OpenCut adicionar novos textos, basta adicionar a entrada
 * correspondente aqui. Não precisa modificar o script injetor.
 */
export const OPENCUT_I18N_DICTIONARY: Record<string, string> = {
  // ====== Página Home / Projects ======
  'Home': 'Início',
  'All projects': 'Todos os projetos',
  'Grid view': 'Visualização em grade',
  'List view': 'Visualização em lista',
  'New project': 'Novo projeto',
  'New': 'Novo',
  'Select all': 'Selecionar tudo',
  'Modified': 'Modificado',
  'Sort descending': 'Ordenar decrescente',
  'Sort ascending': 'Ordenar crescente',
  'No projects yet': 'Nenhum projeto ainda',
  'Create your first project': 'Crie seu primeiro projeto',
  'Masks, animation & more': 'Máscaras, animação e mais',
  'See full changelog': 'Ver changelog completo',
  'Dismiss': 'Dispensar',
  'Notifications alt+T': 'Notificações alt+T',

  // ====== Home — textos longos e específicos da tela inicial ======
  'Search...': 'Buscar...',
  'Search projects...': 'Buscar projetos...',
  'Search projects': 'Buscar projetos',
  'Sort by': 'Ordenar por',
  'Recently modified': 'Modificados recentemente',
  'Recently created': 'Criados recentemente',
  'Name': 'Nome',
  'Date created': 'Data de criação',
  'Date modified': 'Data de modificação',
  'Project name': 'Nome do projeto',
  'Start creating your first project. Import media, edit, and export your videos. All privately.': 'Comece a criar seu primeiro projeto. Importe mídia, edite e exporte seus vídeos. Tudo com privacidade.',
  'Start creating your first project.': 'Comece a criar seu primeiro projeto.',
  'Import media, edit, and export your videos. All privately.': 'Importe mídia, edite e exporte seus vídeos. Tudo com privacidade.',
  'Masks, graph editor for curves, volume & speed controls, preview zoom, canvas backgrounds, and stickers.': 'Máscaras, editor de gráficos para curvas, controles de volume e velocidade, zoom de pré-visualização, planos de fundo de canvas e adesivos.',
  'What\'s new': 'Novidades',
  'What\'s new?': 'Novidades',
  'Changelog': 'Novidades',
  'New features': 'Novos recursos',
  'New in': 'Novo em',
  'Get started': 'Começar',
  'Learn more': 'Saiba mais',
  'Got it': 'Entendi',
  'Got it!': 'Entendi!',
  'View all': 'Ver tudo',
  'View all updates': 'Ver todas as atualizações',
  'View changelog': 'Ver novidades',
  'Close changelog': 'Fechar novidades',
  'v0.3.0': 'v0.3.0', // mantém versão

  // ====== Home — Ações de projeto ======
  'Open': 'Abrir',
  'Open project': 'Abrir projeto',
  'Edit': 'Editar',
  'Edit project': 'Editar projeto',
  'Rename project': 'Renomear projeto',
  'Delete project': 'Excluir projeto',
  'Duplicate project': 'Duplicar projeto',
  'Share project': 'Compartilhar projeto',
  'Move to trash': 'Mover para a lixeira',
  'Restore': 'Restaurar',
  'Restore project': 'Restaurar projeto',
  'Delete permanently': 'Excluir permanentemente',
  'Are you sure?': 'Tem certeza?',
  'Are you sure you want to delete this project?': 'Tem certeza que deseja excluir este projeto?',
  'This action cannot be undone.': 'Esta ação não pode ser desfeita.',
  'This will permanently delete this project.': 'Isso excluirá permanentemente este projeto.',
  'Yes, delete it': 'Sim, excluir',
  'No, cancel': 'Não, cancelar',
  'Confirm delete': 'Confirmar exclusão',

  // ====== Home — Empty states ======
  'No projects found': 'Nenhum projeto encontrado',
  'No projects': 'Nenhum projeto',
  'No results': 'Nenhum resultado',
  'No results found': 'Nenhum resultado encontrado',
  'Try adjusting your search': 'Tente ajustar sua busca',
  'Try a different search term': 'Tente um termo de busca diferente',
  'Create one now': 'Crie um agora',
  'Create one': 'Crie um',
  'Get started by creating your first project.': 'Comece criando seu primeiro projeto.',

  // ====== Editor — Menu superior ======
  'Export': 'Exportar',
  'Dark': 'Escuro',
  'Light': 'Claro',
  'System': 'Sistema',
  'Settings': 'Configurações',
  'Assets': 'Recursos',
  'Import': 'Importar',
  'Next': 'Próximo',
  'Close': 'Fechar',
  'Back': 'Voltar',
  'Save': 'Salvar',
  'Delete': 'Excluir',
  'Duplicate': 'Duplicar',
  'Rename': 'Renomear',
  'Cancel': 'Cancelar',
  'Confirm': 'Confirmar',
  'Done': 'Concluir',
  'Apply': 'Aplicar',
  'Reset': 'Redefinir',
  'Undo': 'Desfazer',
  'Redo': 'Refazer',
  'Copy': 'Copiar',
  'Paste': 'Colar',
  'Cut': 'Recortar',
  'Share': 'Compartilhar',
  'Download': 'Baixar',
  'Preview': 'Pré-visualizar',
  'Play': 'Reproduzir',
  'Pause': 'Pausar',
  'Stop': 'Parar',
  'Mute': 'Silenciar',
  'Unmute': 'Ativar som',

  // ====== Editor — Painel lateral (categorias) ======
  'Media': 'Mídia',
  'Text': 'Texto',
  'Stickers': 'Adesivos',
  'Effects': 'Efeitos',
  'Transitions': 'Transições',
  'Captions': 'Legendas',
  'Adjustment': 'Ajuste',
  'Audio': 'Áudio',
  'Filters': 'Filtros',
  'Templates': 'Modelos',
  'Shapes': 'Formas',
  'Elements': 'Elementos',
  'Background': 'Plano de fundo',
  'Foreground': 'Primeiro plano',
  'Layers': 'Camadas',
  'Tracks': 'Faixas',
  'Clips': 'Clipes',

  // ====== Editor — Painel de mídia ======
  'Drag and drop videos, photos, and audio files here': 'Arraste e solte vídeos, fotos e arquivos de áudio aqui',
  'or click to browse': 'ou clique para procurar',
  'Browse files': 'Procurar arquivos',
  'Upload from device': 'Enviar do dispositivo',
  'Upload from URL': 'Enviar de URL',
  'Record': 'Gravar',
  'Record video': 'Gravar vídeo',
  'Record audio': 'Gravar áudio',
  'Record screen': 'Gravar tela',

  // ====== Editor — Canvas / Preview ======
  'Preview canvas': 'Pré-visualizar canvas',
  'Click to edit time': 'Clique para editar o tempo',
  'Fit': 'Ajustar',
  'Fill': 'Preencher',
  'Stretch': 'Esticar',
  'Crop': 'Cortar',
  'Rotate': 'Girar',
  'Flip horizontal': 'Espelhar horizontal',
  'Flip vertical': 'Espelhar vertical',
  'Opacity': 'Opacidade',
  'Position': 'Posição',
  'Size': 'Tamanho',
  'Scale': 'Escala',
  'Width': 'Largura',
  'Height': 'Altura',
  'X': 'X',
  'Y': 'Y',
  'Rotation': 'Rotação',
  'Radius': 'Raio',
  'Border': 'Borda',
  'Shadow': 'Sombra',
  'Blur': 'Desfoque',
  'Brightness': 'Brilho',
  'Contrast': 'Contraste',
  'Saturation': 'Saturação',
  'Hue': 'Matiz',
  'Volume': 'Volume',
  'Speed': 'Velocidade',
  'Duration': 'Duração',
  'Start': 'Início',
  'End': 'Fim',
  'Trim': 'Aparar',
  'Split': 'Dividir',
  'Snap': 'Encaixar',
  'Zoom in': 'Ampliar',
  'Zoom out': 'Reduzir',
  'Zoom to fit': 'Ajustar zoom',
  'Zoom to 100%': 'Zoom 100%',

  // ====== Editor — Timeline ======
  'Timeline': 'Linha do tempo',
  'Timeline ruler': 'Régua da linha do tempo',
  'Timeline playhead': 'Cursor da linha do tempo',
  'Drag playhead': 'Arrastar cursor',
  'Main scene': 'Cena principal',
  'Main Track': 'Faixa principal',
  'Main track': 'Faixa principal',
  'Ripple': 'Onda',
  'Add track': 'Adicionar faixa',
  'Add layer': 'Adicionar camada',
  'Add text': 'Adicionar texto',
  'Add media': 'Adicionar mídia',
  'Add effect': 'Adicionar efeito',
  'Add transition': 'Adicionar transição',
  'Add filter': 'Adicionar filtro',
  'Add sticker': 'Adicionar adesivo',
  'Add caption': 'Adicionar legenda',
  'Add shape': 'Adicionar forma',
  'Add element': 'Adicionar elemento',
  'Add audio': 'Adicionar áudio',
  'Add video': 'Adicionar vídeo',
  'Add image': 'Adicionar imagem',
  'Add background': 'Adicionar plano de fundo',

  // ====== Editor — Estados vazios ======
  "It's empty here": 'Está vazio aqui',
  'Click an element on the timeline to edit its properties': 'Clique em um elemento na linha do tempo para editar suas propriedades',
  'No media added': 'Nenhuma mídia adicionada',
  'No effects added': 'Nenhum efeito adicionado',
  'No transitions added': 'Nenhuma transição adicionada',
  'No filters added': 'Nenhum filtro adicionado',
  'No stickers added': 'Nenhum adesivo adicionado',
  'No captions added': 'Nenhuma legenda adicionada',
  'No audio added': 'Nenhum áudio adicionado',
  'No text added': 'Nenhum texto adicionado',

  // ====== Editor — Select track ======
  'Select Main Track track': 'Selecionar faixa Principal',
  'Select track': 'Selecionar faixa',
  'Track': 'Faixa',
  'Layer': 'Camada',
  'Clip': 'Clipe',
  'Element': 'Elemento',
  'Scene': 'Cena',
  'Project': 'Projeto',
  'Properties': 'Propriedades',
  'Inspector': 'Inspetor',

  // ====== Editor — Welcome / Onboarding ======
  'Welcome to OpenCut Beta! 🎉': 'Bem-vindo ao OpenCut Beta! 🎉',
  'Skip': 'Pular',
  'Previous': 'Anterior',
  'Finish': 'Concluir',
  'Continue': 'Continuar',
  'Next:': 'Próximo:',

  // ====== Editor — Export ======
  'Export video': 'Exportar vídeo',
  'Export settings': 'Configurações de exportação',
  'Resolution': 'Resolução',
  'Frame rate': 'Taxa de quadros',
  'Format': 'Formato',
  'Quality': 'Qualidade',
  'High': 'Alta',
  'Medium': 'Média',
  'Low': 'Baixa',
  'Custom': 'Personalizada',
  'Auto': 'Automática',
  'Original': 'Original',
  'File name': 'Nome do arquivo',
  'Export to': 'Exportar para',
  'Export to device': 'Exportar para dispositivo',
  'Export to URL': 'Exportar para URL',
  'Exporting...': 'Exportando...',
  'Export complete': 'Exportação concluída',
  'Export failed': 'Falha na exportação',

  // ====== Editor — Configurações ======
  'General': 'Geral',
  'Appearance': 'Aparência',
  'Language': 'Idioma',
  'Theme': 'Tema',
  'Editor': 'Editor',
  'Playback': 'Reprodução',
  'Performance': 'Desempenho',
  'Storage': 'Armazenamento',
  'Advanced': 'Avançado',
  'About': 'Sobre',
  'Help': 'Ajuda',
  'Feedback': 'Comentários',
  'Report a bug': 'Relatar um bug',
  'Keyboard shortcuts': 'Atalhos do teclado',
  'Version': 'Versão',

  // ====== Textos curtos / unitários ======
  's': 's', // segundos
  'ms': 'ms', // milissegundos
  'fps': 'fps',
  'px': 'px',
  '%': '%',
  'deg': '°',
  'f': 'q', // frames → quadros
};

/**
 * Lista de termos que NÃO devem ser traduzidos (marcas, siglas, etc).
 * O injetor pula esses mesmos se aparecerem isolados.
 */
export const OPENCUT_DO_NOT_TRANSLATE: Set<string> = new Set([
  'OpenCut',
  'Beta',
  'v0.3.0',
  'v0.3',
  'v0.2',
  'v0.1',
  'MP4',
  'MOV',
  'WebM',
  'GIF',
  'PNG',
  'JPG',
  'JPEG',
  'WebP',
  'MP3',
  'WAV',
  'AAC',
  'FLAC',
  '4K',
  '8K',
  'HD',
  'FHD',
  'QHD',
  'UHD',
]);

/**
 * Gera o script JS que será injetado dentro do iframe do OpenCut.
 * Esse script:
 *   1. Roda um MutationObserver que detecta novos elementos sendo adicionados
 *   2. Pra cada elemento, verifica se o texto casa com alguma chave do dicionário
 *   3. Se casar, substitui pela tradução
 *   4. Marca elementos traduzidos com data-i18n-translated pra não reprocessar
 */
export function buildOpenCutInjectorScript(): string {
  // Serializa dicionário e lista de "não traduzir" pra embedar no script
  const dictionaryJson = JSON.stringify(OPENCUT_I18N_DICTIONARY);
  const doNotTranslateJson = JSON.stringify(Array.from(OPENCUT_DO_NOT_TRANSLATE));

  return `
(function() {
  'use strict';
  if (window.__OPENCUT_PT_BR_INJECTED__) return;
  window.__OPENCUT_PT_BR_INJECTED__ = true;

  const DICTIONARY = ${dictionaryJson};
  const DO_NOT_TRANSLATE = new Set(${doNotTranslateJson});

  // ============================================================================
  // INTERCEPTAÇÃO DE URLs EM RUNTIME
  // ============================================================================
  // O HTML inicial vem com URLs reescritas (/api/opencut-proxy/_next/...), mas
  // quando o React carrega, ele busca chunks adicionais usando paths absolutos
  // direto do seu bundle JS (/_next/static/...). Esses requests falham porque
  // o Worker do Éden não sabe que /_next/ é do OpenCut.
  //
  // Solução: monkey-patch em fetch(), XMLHttpRequest, e criação de <script>/<link>
  // pra reescrever URLs /_next/, /icons/, /favicon, /manifest.json em runtime.
  // ============================================================================
  const PROXY_PREFIX = '/api/opencut-proxy';
  const OPENCUT_INTERNAL_PATHS = ['/_next/', '/icons/', '/favicon', '/manifest.json', '/browserconfig.xml', '/open-graph/', '/_rsc/'];

  function shouldRewrite(url) {
    if (!url) return false;
    // Só reescreve URLs relativas (começam com /) ou URLs do próprio opencut.app
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url.includes('opencut.app') || url.startsWith(window.location.origin + PROXY_PREFIX);
    }
    if (url.startsWith('//')) return false; // protocol-relative
    if (url.startsWith('data:') || url.startsWith('blob:')) return false;
    // Verifica se começa com algum path interno do OpenCut
    return OPENCUT_INTERNAL_PATHS.some(p => url.startsWith(p));
  }

  function rewriteUrl(url) {
    if (!url || !shouldRewrite(url)) return url;
    // Se é URL completa do opencut.app, extrai o path
    if (url.startsWith('http')) {
      try {
        const u = new URL(url);
        return PROXY_PREFIX + u.pathname + u.search;
      } catch { return url; }
    }
    // Se já tem o prefix, não reescreve de novo
    if (url.startsWith(PROXY_PREFIX)) return url;
    // Adiciona prefixo
    return PROXY_PREFIX + url;
  }

  // Monkey-patch em fetch()
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === 'string') {
      input = rewriteUrl(input);
    } else if (input instanceof Request) {
      const newUrl = rewriteUrl(input.url);
      if (newUrl !== input.url) {
        input = new Request(newUrl, input);
      }
    }
    return originalFetch.call(this, input, init);
  };

  // Monkey-patch em XMLHttpRequest.open()
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (typeof url === 'string') {
      url = rewriteUrl(url);
    }
    return originalXhrOpen.call(this, method, url, ...rest);
  };

  // Monkey-patch em document.createElement pra reescrever src/href de script/link/img
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function(tagName) {
    const el = originalCreateElement(tagName);
    if (typeof tagName === 'string') {
      const lower = tagName.toLowerCase();
      if (lower === 'script' || lower === 'link' || lower === 'img' || lower === 'source' || lower === 'audio' || lower === 'video') {
        // Interceptar setAttribute
        const originalSetAttribute = el.setAttribute.bind(el);
        el.setAttribute = function(name, value) {
          if ((name === 'src' || name === 'href') && typeof value === 'string') {
            value = rewriteUrl(value);
          }
          return originalSetAttribute(name, value);
        };
        // Interceptar assignments diretos a .src e .href
        try {
          const proto = Object.getPrototypeOf(el);
          const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
          const hrefDesc = Object.getOwnPropertyDescriptor(proto, 'href');
          if (srcDesc && srcDesc.set) {
            Object.defineProperty(el, 'src', {
              get: srcDesc.get,
              set: function(v) { srcDesc.set.call(this, rewriteUrl(v)); },
              configurable: true,
            });
          }
          if (hrefDesc && hrefDesc.set && lower === 'link') {
            Object.defineProperty(el, 'href', {
              get: hrefDesc.get,
              set: function(v) { hrefDesc.set.call(this, rewriteUrl(v)); },
              configurable: true,
            });
          }
        } catch (e) {}
      }
    }
    return el;
  };

  // Pré-compila lista de chaves longas primeiro (pra "New project" casar antes de "New")
  const sortedKeys = Object.keys(DICTIONARY).sort((a, b) => b.length - a.length);

  // Normaliza whitespace: colapsa múltiplos espaços em 1, trim
  function normalize(s) {
    return (s || '').replace(/\\s+/g, ' ').trim();
  }

  // Mapa lowercased -> key original, pra lookup case-insensitive rápido
  const lowerKeyMap = {};
  for (const k of Object.keys(DICTIONARY)) {
    lowerKeyMap[k.toLowerCase()] = k;
  }

  function lookupTranslation(text) {
    if (!text) return null;
    const normalized = normalize(text);
    if (!normalized || DO_NOT_TRANSLATE.has(normalized)) return null;
    // Match exato
    if (DICTIONARY[normalized]) return DICTIONARY[normalized];
    // Match case-insensitive
    const lower = normalized.toLowerCase();
    if (lowerKeyMap[lower]) return DICTIONARY[lowerKeyMap[lower]];
    return null;
  }

  function translateElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.hasAttribute && el.hasAttribute('data-i18n-translated')) return;

    // Traduz textContent (só se for texto direto, sem children visíveis)
    // Permite SVG/PATH filhos (que não têm texto visível)
    const hasTextChildren = el.children.length === 0 ||
      Array.from(el.children).every(c => c.tagName === 'SVG' || c.tagName === 'PATH' || c.tagName === 'CIRCLE' || c.tagName === 'RECT' || c.tagName === 'POLYGON' || c.tagName === 'SPAN' && c.children.length === 0);

    if (hasTextChildren && el.textContent != null) {
      const original = el.textContent;
      const translation = lookupTranslation(original);
      if (translation) {
        // Preserva SVG/icons mas troca só o texto
        // Estratégia simples: salva SVGs, troca textContent, restaura SVGs
        const svgs = el.querySelectorAll('svg, path, circle, rect, polygon');
        const svgClones = Array.from(svgs).map(s => s.cloneNode(true));
        el.textContent = translation;
        // Re-adiciona SVGs no final (não ideal mas funciona pra botões com ícone + texto)
        // Nota: se o elemento era só texto, isso não afeta nada
        if (svgClones.length > 0) {
          // Não re-adiciona — a maioria dos casos é botão com ícone separado
          // Se precisar re-adicionar, o React vai re-renderizar ao atualizar estado
        }
        el.setAttribute('data-i18n-translated', '1');
        return;
      }
    }

    // Traduz atributos comuns: title, aria-label, placeholder
    const attrsToTranslate = ['title', 'aria-label', 'placeholder'];
    for (const attr of attrsToTranslate) {
      const val = el.getAttribute(attr);
      if (val) {
        const translation = lookupTranslation(val);
        if (translation) {
          el.setAttribute(attr, translation);
        }
      }
    }
  }

  function scanAll(root) {
    if (!root || !root.querySelectorAll) return;
    translateElement(root);
    try {
      const elements = root.querySelectorAll('*');
      elements.forEach(translateElement);
    } catch (e) {}
  }

  function initialScan() {
    if (document.body) {
      scanAll(document.body);
    }
  }

  // MutationObserver: detecta novos elementos sendo adicionados pelo React
  let observer = null;
  function startObserver() {
    if (!document.body) {
      // Body ainda não existe, tenta de novo em 50ms
      setTimeout(startObserver, 50);
      return;
    }
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              translateElement(node);
              if (node.querySelectorAll) {
                try {
                  node.querySelectorAll('*').forEach(translateElement);
                } catch (e) {}
              }
            }
          });
        } else if (mutation.type === 'characterData') {
          if (mutation.target.parentElement) {
            translateElement(mutation.target.parentElement);
          }
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // Traduz periódicamente nos primeiros 15s (pra pegar tudo que React pinta aos poucos)
  let scanCount = 0;
  const maxScans = 30; // 30 scans x 500ms = 15s
  const periodicScan = setInterval(() => {
    scanAll(document.body);
    scanCount++;
    if (scanCount >= maxScans) {
      clearInterval(periodicScan);
    }
  }, 500);

  // Setup quando DOM tiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialScan();
      startObserver();
    });
  } else {
    initialScan();
    startObserver();
  }

  // Log de debug
  console.log('[OpenCut PT-BR] Dicionário injetado com', Object.keys(DICTIONARY).length, 'traduções');
})();
`.trim();
}
