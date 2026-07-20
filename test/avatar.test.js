'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { avatarSvg, avatarAleatorio, TAMANHOS } = require('../public/shared/avatar');

test('avatarSvg gera SVG completo e faz wrap de índices fora do intervalo', () => {
  const svg = avatarSvg({ fundo: 99, rosto: 99, olhos: 99, boca: 99, acessorio: 99 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(!svg.includes('TRACO'));
  assert.ok(!svg.includes('undefined'));
});

test('avatar ausente ou nulo usa o padrão sem quebrar', () => {
  assert.ok(avatarSvg(null).startsWith('<svg'));
  assert.ok(avatarSvg({}).startsWith('<svg'));
});

test('avatarAleatorio respeita os tamanhos das listas', () => {
  const maximo = avatarAleatorio(() => 0.9999);
  assert.strictEqual(maximo.fundo, TAMANHOS.fundo - 1);
  assert.strictEqual(maximo.acessorio, TAMANHOS.acessorio - 1);
  const minimo = avatarAleatorio(() => 0);
  assert.strictEqual(minimo.rosto, 0);
});
