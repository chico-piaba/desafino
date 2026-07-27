'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { recalibrar, contarPalavras, dureza, posicoesPorArtista } = require('../src/recalibrar');

test('contarPalavras ignora parênteses e trata barra e hífen como separador', () => {
  assert.strictEqual(contarPalavras('Aquarela'), 1);
  assert.strictEqual(contarPalavras('Garota de Ipanema'), 3);
  assert.strictEqual(contarPalavras('Evidências (Ao Vivo)'), 1);
  assert.strictEqual(contarPalavras('Trem-Bala'), 2);
  assert.strictEqual(contarPalavras('Você Não Me Ensinou a Te Esquecer'), 7);
});

test('posicoesPorArtista numera na ordem do arquivo, por artista', () => {
  const p = posicoesPorArtista([
    { id: 'a', artista: 'Queen' }, { id: 'b', artista: 'Pitty' },
    { id: 'c', artista: 'Queen' }, { id: 'd', artista: 'queen' },
  ]);
  assert.strictEqual(p.get('a'), 0);
  assert.strictEqual(p.get('b'), 0);
  assert.strictEqual(p.get('c'), 1);
  assert.strictEqual(p.get('d'), 2, 'artista compara sem caixa');
});

test('dureza cresce com posição pior e título mais longo', () => {
  const cartas = [
    { id: 'a', artista: 'X', titulo: 'Um' },
    { id: 'b', artista: 'X', titulo: 'Um' },
  ];
  const p = posicoesPorArtista(cartas);
  assert.ok(dureza(cartas[1], p) > dureza(cartas[0], p), 'faixa menos popular é mais dura');
  const curto = { id: 'c', artista: 'Y', titulo: 'Ela' };
  const longo = { id: 'd', artista: 'Z', titulo: 'Ela Foi Embora Sem Dizer Nada' };
  const p2 = posicoesPorArtista([curto, longo]);
  assert.ok(dureza(longo, p2) > dureza(curto, p2), 'título longo é mais duro');
});

test('recalibrar atinge a distribuição-alvo', () => {
  // 10 cartas todas marcadas nível 1 por um modelo permissivo.
  const cartas = Array.from({ length: 10 }, (_, i) => ({
    id: `c${i}`, artista: 'A', titulo: 'x '.repeat(i + 1).trim(), dificuldade: 1,
  }));
  const mudancas = recalibrar(cartas, { 1: 0.5, 2: 0.3, 3: 0.2 });
  const finais = cartas.map((c) => mudancas.get(c.id) || c.dificuldade);
  assert.strictEqual(finais.filter((n) => n === 1).length, 5);
  assert.strictEqual(finais.filter((n) => n === 2).length, 3);
  assert.strictEqual(finais.filter((n) => n === 3).length, 2);
});

test('recalibrar promove as mais duras, não as primeiras da lista', () => {
  const cartas = [
    { id: 'facil', artista: 'A', titulo: 'Ela', dificuldade: 1 },
    { id: 'dura', artista: 'B', titulo: 'Ela Foi Embora Sem Dizer Nada Pra Ninguem', dificuldade: 1 },
  ];
  const m = recalibrar(cartas, { 1: 0.5, 2: 0.5, 3: 0 });
  assert.strictEqual(m.get('dura'), 2, 'a de título longo sobe');
  assert.strictEqual(m.get('facil'), undefined, 'a curta fica');
});

test('recalibrar respeita o nível do modelo como chave primária', () => {
  // Uma carta nível 3 curta não deve descer abaixo de uma nível 1 longa.
  const cartas = [
    { id: 'n1longa', artista: 'A', titulo: 'Uma Frase Bem Longa Aqui Assim', dificuldade: 1 },
    { id: 'n3curta', artista: 'B', titulo: 'Rap', dificuldade: 3 },
  ];
  const m = recalibrar(cartas, { 1: 0.5, 2: 0, 3: 0.5 });
  const nivel = (id) => m.get(id) ?? cartas.find((c) => c.id === id).dificuldade;
  assert.ok(nivel('n3curta') > nivel('n1longa'), 'a ordem do modelo prevalece');
});

test('recalibrar ignora carta sem nível válido e lista vazia', () => {
  assert.strictEqual(recalibrar([], { 1: 1 }).size, 0);
  assert.strictEqual(recalibrar([{ id: 'x', titulo: 'a', artista: 'b' }], { 1: 1 }).size, 0);
});
