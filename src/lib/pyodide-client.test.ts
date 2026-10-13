import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatPythonOutput, PythonExecutionResult } from './pyodide-client';

describe('formatPythonOutput', () => {
  it('deve formatar saída padrão quando stdout estiver presente', () => {
    const res: PythonExecutionResult = {
      success: true,
      stdout: 'Olá Mundo',
      stderr: '',
      executionTimeMs: 42,
    };
    const formatted = formatPythonOutput(res);
    assert.ok(formatted.includes('Olá Mundo'));
    assert.ok(formatted.includes('42ms'));
  });

  it('deve formatar erro de execução claramente', () => {
    const res: PythonExecutionResult = {
      success: false,
      stdout: '',
      stderr: '',
      error: 'NameError: name "x" is not defined',
      executionTimeMs: 15,
    };
    const formatted = formatPythonOutput(res);
    assert.ok(formatted.includes('Erro de Execução'));
    assert.ok(formatted.includes('NameError'));
  });

  it('deve incluir valor retornado se stdout for vazio', () => {
    const res: PythonExecutionResult = {
      success: true,
      stdout: '',
      stderr: '',
      result: '42',
      executionTimeMs: 10,
    };
    const formatted = formatPythonOutput(res);
    assert.ok(formatted.includes('Resultado: 42'));
  });
});
