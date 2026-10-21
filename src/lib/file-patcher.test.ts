import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilePatches,
  normalizePatchArgs,
  resolveEffectiveFileContent,
} from './file-patcher';
import type { PendingChange } from './types';

describe('file-patcher (Surgical File Patching & Pending Changes Memory)', () => {
  it('aplica substituição cirúrgica simples preservando o restante do arquivo', () => {
    const original = [
      'import React from "react";',
      '',
      'export function Counter() {',
      '  const [count, setCount] = React.useState(0);',
      '  return <button onClick={() => setCount(count + 1)}>{count}</button>;',
      '}',
    ].join('\n');

    const res = applyFilePatches(original, [
      {
        old_str: '  const [count, setCount] = React.useState(0);',
        new_str: '  const [count, setCount] = React.useState(10);',
      },
    ]);

    assert.equal(res.success, true);
    assert.equal(res.appliedCount, 1);
    assert.ok(res.content.includes('React.useState(10)'));
    assert.ok(res.content.includes('import React from "react";'));
  });

  it('aplica múltiplos blocos de patch sequencialmente no mesmo arquivo', () => {
    const original = [
      'const TITLE = "Old Title";',
      'const SUBTITLE = "Old Subtitle";',
      'export function Header() {',
      '  return <h1>{TITLE} - {SUBTITLE}</h1>;',
      '}',
    ].join('\n');

    const res = applyFilePatches(original, [
      { old_str: 'const TITLE = "Old Title";', new_str: 'const TITLE = "Éden";' },
      { old_str: 'const SUBTITLE = "Old Subtitle";', new_str: 'const SUBTITLE = "Espaço";' },
    ]);

    assert.equal(res.success, true);
    assert.equal(res.appliedCount, 2);
    assert.ok(res.content.includes('const TITLE = "Éden";'));
    assert.ok(res.content.includes('const SUBTITLE = "Espaço";'));
  });

  it('tolera diferenças de quebra de linha CRLF no arquivo original quando o patch vem com LF', () => {
    const originalCRLF = 'function hello() {\r\n  console.log("old");\r\n  return true;\r\n}';
    const res = applyFilePatches(originalCRLF, [
      {
        old_str: 'function hello() {\n  console.log("old");\n  return true;\n}',
        new_str: 'function hello() {\n  console.log("new");\n  return true;\n}',
      },
    ]);

    assert.equal(res.success, true);
    assert.equal(res.appliedCount, 1);
    assert.ok(res.content.includes('console.log("new")'));
  });

  it('rejeita com mensagem clara quando old_str é ambíguo (múltiplas ocorrências sem allow_multiple)', () => {
    const original = 'const x = 1;\nconst y = 2;\nconst x = 1;';
    const res = applyFilePatches(original, [
      { old_str: 'const x = 1;', new_str: 'const x = 99;' },
    ]);

    assert.equal(res.success, false);
    assert.ok(res.error?.includes('múltiplas ocorrências') || res.error?.includes('2 ocorrências'));
  });

  it('substitui todas as ocorrências quando allow_multiple é true', () => {
    const original = 'const x = 1;\nconst y = 2;\nconst x = 1;';
    const res = applyFilePatches(original, [
      { old_str: 'const x = 1;', new_str: 'const x = 99;', allow_multiple: true },
    ]);

    assert.equal(res.success, true);
    assert.equal(res.content, 'const x = 99;\nconst y = 2;\nconst x = 99;');
  });

  it('normaliza argumentos flexíveis de patch_file (patches array ou old_str/new_str direto)', () => {
    const fromDirect = normalizePatchArgs({
      path: 'src/App.tsx',
      old_str: 'a',
      new_str: 'b',
    });
    assert.equal(fromDirect.length, 1);
    assert.deepEqual(fromDirect[0], { old_str: 'a', new_str: 'b', allow_multiple: false });

    const fromArray = normalizePatchArgs({
      path: 'src/App.tsx',
      patches: [{ old_str: 'x', new_str: 'y', allow_multiple: true }],
    });
    assert.equal(fromArray.length, 1);
    assert.deepEqual(fromArray[0], { old_str: 'x', new_str: 'y', allow_multiple: true });
  });

  it('resolveEffectiveFileContent retorna a versão mais recente do Source Control (memória contínua)', () => {
    const changes: PendingChange[] = [
      {
        id: '1',
        path: 'src/components/Header.tsx',
        repo: 'Dante2526/Synap',
        branch: 'main',
        type: 'modified',
        originalContent: 'old header',
        newContent: 'new updated header v2',
        createdAt: Date.now(),
        staged: true,
      },
      {
        id: '2',
        path: 'src/legacy.ts',
        repo: 'Dante2526/Synap',
        branch: 'main',
        type: 'deleted',
        originalContent: 'legacy',
        newContent: '',
        createdAt: Date.now(),
        staged: true,
      },
    ];

    const hit = resolveEffectiveFileContent('./src/components/Header.tsx', changes, 'Dante2526/Synap');
    assert.equal(hit.status, 'modified');
    assert.equal(hit.content, 'new updated header v2');
    assert.equal(hit.originalContent, 'old header');

    const deleted = resolveEffectiveFileContent('src/legacy.ts', changes, 'Dante2526/Synap');
    assert.equal(deleted.status, 'deleted');

    const miss = resolveEffectiveFileContent('src/other.ts', changes, 'Dante2526/Synap');
    assert.equal(miss.status, 'unchanged');
  });
});
