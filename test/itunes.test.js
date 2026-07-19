'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { interpretarResultado } = require('../src/itunes');

test('extrai titulo, artista, ano e genero de um resultado completo', () => {
  const r = interpretarResultado({
    trackName: 'Evidências',
    artistName: 'Chitãozinho & Xororó',
    releaseDate: '1990-08-15T07:00:00Z',
    primaryGenreName: 'Sertanejo',
  });
  assert.deepStrictEqual(r, {
    titulo: 'Evidências',
    artista: 'Chitãozinho & Xororó',
    ano: 1990,
    genero: 'Sertanejo',
  });
});

test('campos ausentes viram null sem quebrar', () => {
  const r = interpretarResultado({ trackName: ' Oceano ', artistName: 'Djavan' });
  assert.strictEqual(r.titulo, 'Oceano');
  assert.strictEqual(r.ano, null);
  assert.strictEqual(r.genero, null);
});
