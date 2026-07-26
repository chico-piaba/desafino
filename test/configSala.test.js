'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { PADROES, mesclarPadroes, aplicarKnobs } = require('../src/configSala');

test('mesclarPadroes completa seções que faltam no config.json antigo', () => {
  const antigo = {
    rodada: { duracaoSegundos: 60, totalRodadas: 8 },
    modos: { cantarolar: 100, mimica: 70 },
    dicas: { cantor: 10 },
  };
  const c = mesclarPadroes(antigo);
  assert.strictEqual(c.rodada.duracaoSegundos, 60); // respeita o que veio
  assert.strictEqual(c.sala.maxDuplas, PADROES.sala.maxDuplas); // completa o que faltou
  assert.strictEqual(c.plateia.rouboFracao, 0.05);
  assert.strictEqual(c.troca.custo, 20);
});

test('mesclarPadroes não muda o objeto original', () => {
  const antigo = { rodada: { duracaoSegundos: 60 } };
  mesclarPadroes(antigo);
  assert.strictEqual(antigo.sala, undefined);
});

test('aplicarKnobs satura valores fora da faixa', () => {
  const c = aplicarKnobs(PADROES, { duracaoSegundos: 5, totalRodadas: 999, maxDuplas: 50 });
  assert.strictEqual(c.rodada.duracaoSegundos, 30);
  assert.strictEqual(c.rodada.totalRodadas, 20);
  assert.strictEqual(c.sala.maxDuplas, 10);
});

test('aplicarKnobs aceita valores válidos e booleanos', () => {
  const c = aplicarKnobs(PADROES, {
    duracaoSegundos: 120, maxDuplas: 6, trocaCusto: 30,
    trocaMusica: false, palpitePlateia: false, votacaoPlateia: true, rouboFracao: 0.1,
  });
  assert.strictEqual(c.rodada.duracaoSegundos, 120);
  assert.strictEqual(c.sala.maxDuplas, 6);
  assert.strictEqual(c.troca.custo, 30);
  assert.strictEqual(c.troca.ligada, false);
  assert.strictEqual(c.plateia.palpite, false);
  assert.strictEqual(c.plateia.votacao, true);
  assert.strictEqual(c.plateia.rouboFracao, 0.1);
});

test('aplicarKnobs ignora knob desconhecido e valor não numérico', () => {
  const c = aplicarKnobs(PADROES, { hackeado: 999, duracaoSegundos: 'muito' });
  assert.strictEqual(c.hackeado, undefined);
  assert.strictEqual(c.rodada.duracaoSegundos, PADROES.rodada.duracaoSegundos);
});
