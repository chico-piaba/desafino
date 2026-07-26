'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarRegistrador } = require('../src/eventos');

// appendFile é assíncrono: espera o arquivo atingir a condição em vez de dormir um tempo fixo
async function esperarArquivo(caminho, cond) {
  for (let i = 0; i < 80; i++) {
    try {
      const txt = fs.readFileSync(caminho, 'utf8');
      if (cond(txt)) return txt;
    } catch {}
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`arquivo ${caminho} não atingiu a condição a tempo`);
}

test('registrar devolve evento com ts ISO, tipo e dados', () => {
  const reg = criarRegistrador();
  const e = reg.registrar('jogadorEntrou', { sala: 'ABCD', nome: 'Bia' });
  assert.strictEqual(e.tipo, 'jogadorEntrou');
  assert.strictEqual(e.sala, 'ABCD');
  assert.strictEqual(e.nome, 'Bia');
  assert.ok(!Number.isNaN(Date.parse(e.ts)), 'ts deve ser data ISO válida');
});

test('recentes respeita o limite de memória (descarta os mais antigos)', () => {
  const reg = criarRegistrador({ limiteMemoria: 3 });
  for (let i = 1; i <= 5; i++) reg.registrar('e', { i });
  const is = reg.recentes().map((e) => e.i);
  assert.deepStrictEqual(is, [3, 4, 5]);
});

test('aoRegistrar notifica assinantes com o evento', () => {
  const reg = criarRegistrador();
  const vistos = [];
  reg.aoRegistrar((e) => vistos.push(e.tipo));
  reg.registrar('salaCriada', { sala: 'ABCD' });
  assert.deepStrictEqual(vistos, ['salaCriada']);
});

test('com arquivo, grava uma linha JSONL por evento', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desafino-ev-'));
  const arquivo = path.join(dir, 'eventos.jsonl');
  const reg = criarRegistrador({ arquivo });
  reg.registrar('salaCriada', { sala: 'ABCD' });
  reg.registrar('jogadorEntrou', { sala: 'ABCD', nome: 'Léo' });
  const txt = await esperarArquivo(arquivo, (t) => t.trim().split('\n').length === 2);
  const linhas = txt.trim().split('\n');
  assert.strictEqual(linhas.length, 2);
  const segunda = JSON.parse(linhas[1]);
  assert.strictEqual(segunda.tipo, 'jogadorEntrou');
  assert.strictEqual(segunda.nome, 'Léo');
});

test('sem arquivo (null) não grava nada e não explode', () => {
  const reg = criarRegistrador({ arquivo: null });
  assert.doesNotThrow(() => reg.registrar('salaCriada', { sala: 'ABCD' }));
  assert.strictEqual(reg.recentes().length, 1);
});
