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
  'Get started': 'Começar',
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
  'Changelog': 'Novidades',

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

  // Pré-compila regex com chaves longas primeiro (pra "New project" casar antes de "New")
  const sortedKeys = Object.keys(DICTIONARY).sort((a, b) => b.length - a.length);

  function translateElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.hasAttribute && el.hasAttribute('data-i18n-translated')) return;

    // Traduz textContent (só se for texto direto, sem children)
    if (el.children.length === 0 && el.textContent) {
      const original = el.textContent.trim();
      if (original && !DO_NOT_TRANSLATE.has(original)) {
        // Tenta match exato primeiro
        if (DICTIONARY[original]) {
          el.textContent = DICTIONARY[original];
          el.setAttribute('data-i18n-translated', '1');
          return;
        }
        // Tenta match case-insensitive (mas mantém tradução)
        const lower = original.toLowerCase();
        for (const key of sortedKeys) {
          if (key.toLowerCase() === lower) {
            el.textContent = DICTIONARY[key];
            el.setAttribute('data-i18n-translated', '1');
            return;
          }
        }
      }
    }

    // Traduz atributos comuns: title, aria-label, placeholder
    const attrsToTranslate = ['title', 'aria-label', 'placeholder'];
    for (const attr of attrsToTranslate) {
      const val = el.getAttribute(attr);
      if (val && !DO_NOT_TRANSLATE.has(val) && DICTIONARY[val]) {
        el.setAttribute(attr, DICTIONARY[val]);
      }
    }
  }

  function scanAll(root) {
    if (!root || !root.querySelectorAll) return;
    // Traduz o próprio root
    translateElement(root);
    // Traduz todos os descendentes
    const elements = root.querySelectorAll('*');
    elements.forEach(translateElement);
  }

  // Primeiro scan depois que a página carrega
  function initialScan() {
    scanAll(document.body);
  }

  // MutationObserver: detecta novos elementos sendo adicionados pelo React
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            translateElement(node);
            if (node.querySelectorAll) {
              node.querySelectorAll('*').forEach(translateElement);
            }
          }
        });
      } else if (mutation.type === 'characterData') {
        // Texto mudou em um text node
        if (mutation.target.parentElement) {
          translateElement(mutation.target.parentElement);
        }
      }
    }
  });

  // Inicia observer
  function startObserver() {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // Traduz periódicamente nos primeiros 10s (pra pegar tudo que React pinta aos poucos)
  let scanCount = 0;
  const maxScans = 20;
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
