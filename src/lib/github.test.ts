import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeGitHubFileContent } from './github';

describe('GitHub File Content Decoder (UTF-8 & Base64)', () => {
  it('deve decodificar Base64 com quebras de linha da GitHub API preservando UTF-8 (acentos e emojis)', () => {
    const original = 'export const title = "Botão de Vídeo — Éden 🎬";\nconsole.log(title);\n';
    const b64WithNewlines = Buffer.from(original, 'utf-8')
      .toString('base64')
      .replace(/(.{60})/g, '$1\n');

    const decoded = decodeGitHubFileContent(b64WithNewlines, 'base64');
    assert.equal(decoded, original);
  });

  it('deve decodificar automaticamente payload Base64 do GitHub mesmo quando encoding for omitido', () => {
    const githubRawTaskMd =
      'IyBUYXJlZmE6IE5hdmVnYWRvciBBdXTDtG5vbW8gcGFyYSBNb2RlbG9zIGRl\n' +
      'IElBIChCcm93c2VyIENvbnRyb2wpCgotIFt4XSAqKlRhcmVmYSAxIChNb3Rv\n' +
      'ciBUREQgJiBUZXN0ZXMpOioqIENyaWFyIGBzcmMvbGliL2Jyb3dzZXItYWdl\n' +
      'bnQtZW5naW5lLnRzYA==\n';

    const decoded = decodeGitHubFileContent(githubRawTaskMd);
    assert.ok(decoded.startsWith('# Tarefa: Navegador Autônomo para Modelos de IA'));
    assert.ok(decoded.includes('Tarefa 1 (Motor TDD & Testes)'));
  });

  it('deve preservar texto plano UTF-8 intacto quando não estiver em Base64', () => {
    const plainCode = 'import React from "react";\nexport function App() { return <div>Olá Éden</div>; }';
    assert.equal(decodeGitHubFileContent(plainCode, 'utf-8'), plainCode);
    assert.equal(decodeGitHubFileContent(plainCode), plainCode);
  });
});
