'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalizar, distancia, pareceCerto } = require('../src/texto');

test('normalizar tira caixa, acento e pontuação', () => {
  assert.strictEqual(normalizar('EVIDÊNCIAS!!'), 'evidencias');
  assert.strictEqual(normalizar("Don't Stop Me Now"), 'dont stop me now');
  assert.strictEqual(normalizar('Trem-Bala'), 'trem bala');
});

test('normalizar tira trecho entre parênteses e artigo inicial', () => {
  assert.strictEqual(normalizar('Evidências (Ao Vivo)'), 'evidencias');
  assert.strictEqual(normalizar('A Garota de Ipanema'), 'garota de ipanema');
  assert.strictEqual(normalizar('The Wall'), 'wall');
});

test('normalizar não engole um título que é só o artigo', () => {
  assert.strictEqual(normalizar('A'), 'a');
});

test('distancia conta edições', () => {
  assert.strictEqual(distancia('abc', 'abc'), 0);
  assert.strictEqual(distancia('abc', 'abd'), 1);
  assert.strictEqual(distancia('abc', ''), 3);
});

test('pareceCerto aceita erro de digitação proporcional ao tamanho', () => {
  assert.ok(pareceCerto('evidencias', 'Evidências'));
  assert.ok(pareceCerto('EVIDÊNCIAS!!', 'Evidências'));
  assert.ok(pareceCerto('evidencas', 'Evidências')); // 1 erro, limiar 2
  assert.ok(pareceCerto('a garota de ipanema', 'Garota de Ipanema'));
});

test('pareceCerto rejeita título diferente e palpite vazio', () => {
  assert.ok(!pareceCerto('evidente', 'Evidências'));
  assert.ok(!pareceCerto('aquarela', 'Evidências'));
  assert.ok(!pareceCerto('   ', 'Evidências'));
  assert.ok(!pareceCerto('sim', 'Não'));
});
