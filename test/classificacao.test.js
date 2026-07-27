'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { saneiaTags, dicaVazada, validarFicha } = require('../src/classificacao');

const CARTA = { titulo: 'Evidências', artista: 'Chitãozinho & Xororó', ano: 1990 };

test('saneiaTags só aceita o vocabulário fechado', () => {
  assert.deepStrictEqual(saneiaTags(['Nacional', 'Sertanejo']), ['nacional', 'sertanejo']);
  assert.deepStrictEqual(saneiaTags(['inventada', 'xyz']), []);
  assert.deepStrictEqual(saneiaTags('nada disso'), []);
});

test('saneiaTags resolve nacional e internacional juntas', () => {
  assert.deepStrictEqual(saneiaTags(['nacional', 'internacional']), ['nacional']);
});

test('dicaVazada pega o título mesmo com acento e caixa diferentes', () => {
  assert.match(dicaVazada('A música Evidencias fala de negação', CARTA), /título/);
  assert.match(dicaVazada('EVIDÊNCIAS!! é sobre isso', CARTA), /título/);
});

test('dicaVazada pega o artista', () => {
  assert.match(dicaVazada('Dupla sertaneja Chitãozinho e Xororó canta sobre amor', CARTA), /artista/);
});

test('dicaVazada pega título de uma palavra citado no meio da frase', () => {
  const uma = { titulo: 'Aquarela', artista: 'Toquinho', ano: 1983 };
  assert.match(dicaVazada('Uma aquarela pintada no papel do tempo', uma), /título/);
});

test('dicaVazada aceita dica que não entrega nada', () => {
  assert.strictEqual(dicaVazada('Um homem tentando negar o óbvio e se entregando na frase seguinte', CARTA), null);
  assert.strictEqual(dicaVazada('   ', CARTA), 'vazia');
});

test('validarFicha aceita ficha completa e devolve campos saneados', () => {
  const r = validarFicha({
    tipo: 'musica', tags: ['Nacional', 'sertanejo', 'lixo'], dificuldade: 1,
    dica: 'Um homem nega o óbvio e se entrega na frase seguinte.',
  }, CARTA);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.campos.tags, ['nacional', 'sertanejo']);
  assert.strictEqual(r.campos.dificuldade, 1);
  assert.strictEqual(r.campos.tipo, 'musica');
});

test('validarFicha recusa dificuldade fora da faixa e dica que vaza', () => {
  const r = validarFicha({ tags: ['nacional'], dificuldade: 7, dica: 'Fala de Evidências' }, CARTA);
  assert.strictEqual(r.ok, false);
  assert.ok(r.problemas.some((p) => /dificuldade/.test(p)));
  assert.ok(r.problemas.some((p) => /título/.test(p)));
});

test('validarFicha recusa ficha sem tag válida e ficha ausente', () => {
  assert.strictEqual(validarFicha({ tags: [], dificuldade: 2, dica: 'ok' }, CARTA).ok, false);
  assert.strictEqual(validarFicha(null, CARTA).ok, false);
});

test('dicaVazada pega o título fora de ordem, não só a sequência exata', () => {
  const gi = { titulo: 'Garota de Ipanema', artista: 'Tom Jobim', ano: 1962 };
  assert.match(dicaVazada('A garota mais linda que passa em Ipanema', gi), /título/);
  // Uma palavra só do título não basta — senão toda dica viraria vazamento.
  assert.strictEqual(dicaVazada('Uma garota que faz o mundo parar', gi), null);
});
