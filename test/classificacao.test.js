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

test('dicaVazada pega o título fora de ordem e também uma palavra só', () => {
  const gi = { titulo: 'Garota de Ipanema', artista: 'Tom Jobim', ano: 1962 };
  assert.match(dicaVazada('A garota mais linda que passa em Ipanema', gi), /título/);
  // Uma palavra forte já basta: "garota" sozinha entrega metade da resposta.
  assert.match(dicaVazada('Uma garota que faz o mundo parar', gi), /garota/);
  assert.strictEqual(dicaVazada('Alguém passa na areia e o mundo inteiro para de falar', gi), null);
});

test('dicaVazada pega UMA palavra do título, não só o título inteiro', () => {
  const sg = { titulo: 'Sorte Grande', artista: 'Ivete Sangalo', ano: 2004 };
  // Caso real do primeiro lote: metade do título escapou pela regra antiga.
  assert.match(dicaVazada('Alguém agradece ao destino e celebra a boa sorte que mudou tudo', sg), /sorte/);
  assert.strictEqual(dicaVazada('Alguém agradece ao destino que virou tudo de cabeça para baixo', sg), null);
});

test('dicaVazada não reprova dica por palavra comum do título', () => {
  const c = { titulo: 'Como Uma Onda', artista: 'Lulu Santos', ano: 1983 };
  // "como" é palavra vazia; "onda" não. Só a segunda deve reprovar.
  assert.strictEqual(dicaVazada('Tudo muda como o tempo passa e nada fica parado', c), null);
  assert.match(dicaVazada('O mar traz uma onda que leva tudo embora', c), /onda/);
});

test('palavra comum sozinha não vaza, mas o título inteiro sim', () => {
  const cv = { titulo: 'Coisas da Vida', artista: 'Zezé Di Camargo', ano: 1991 };
  // "vida" é genérica: sem ela, título assim não admitiria dica evocativa nenhuma.
  assert.strictEqual(dicaVazada('Os altos e baixos que a vida traz sem avisar', cv), null);
  // As duas juntas entregam o título por completo.
  assert.match(dicaVazada('As coisas que a vida traz sem avisar', cv), /título/);
});

test('palavra distintiva continua vazando mesmo sozinha', () => {
  const sg = { titulo: 'Sorte Grande', artista: 'Ivete Sangalo', ano: 2004 };
  assert.match(dicaVazada('Celebrando a boa sorte que mudou tudo', sg), /sorte/);
});
