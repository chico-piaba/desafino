'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { interpretar } = require('../src/wikipedia');

test('extrai título e artista do padrão "(canção de X)"', () => {
  const r = interpretar('Evidências (canção de Chitãozinho & Xororó)', 'lançada em <span>1990</span> pela dupla');
  assert.strictEqual(r.titulo, 'Evidências');
  assert.strictEqual(r.artista, 'Chitãozinho & Xororó');
  assert.strictEqual(r.ano, 1990);
});

test('título sem parênteses fica como está, artista nulo', () => {
  const r = interpretar('Garota de Ipanema', 'bossa nova de 1962 composta por Tom Jobim');
  assert.strictEqual(r.titulo, 'Garota de Ipanema');
  assert.strictEqual(r.artista, null);
  assert.strictEqual(r.ano, 1962);
});

test('aceita "(música)" simples e snippet sem ano', () => {
  const r = interpretar('Oceano (música)', 'sem data no trecho');
  assert.strictEqual(r.titulo, 'Oceano');
  assert.strictEqual(r.artista, null);
  assert.strictEqual(r.ano, null);
  assert.strictEqual(r.resumo, 'sem data no trecho');
});
