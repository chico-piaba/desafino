'use strict';
const test = require('node:test');
const assert = require('node:assert');
const config = require('../config.json');

test('config tem os valores de balanceamento do spec', () => {
  assert.deepStrictEqual(config.rodada, { duracaoSegundos: 90, totalRodadas: 8 });
  assert.deepStrictEqual(config.modos, { cantarolar: 100, mimica: 70 });
  assert.deepStrictEqual(config.x1, { bonusApresentador: 0.5 });
  assert.deepStrictEqual(config.dicas, {
    cantor: 10, ano: 10, decada: 5, genero: 10, inicialDoTitulo: 15, forca: 25,
  });
});
