'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarBanco } = require('../src/bancoMusicas');

function bancoTemporario(conteudo = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desafino-'));
  const caminho = path.join(dir, 'musicas.json');
  fs.writeFileSync(caminho, JSON.stringify(conteudo));
  return criarBanco(caminho);
}

test('ler retorna o conteúdo do arquivo', () => {
  const banco = bancoTemporario([{ id: 'x', titulo: 'X', artista: 'Y', ano: 2000 }]);
  assert.strictEqual(banco.ler().length, 1);
  assert.strictEqual(banco.ler()[0].titulo, 'X');
});

test('adicionar valida, gera id e persiste', () => {
  const banco = bancoTemporario();
  const musica = banco.adicionar({ titulo: 'Oceano', artista: 'Djavan', ano: 1989 });
  assert.ok(musica.id.length > 0);
  assert.strictEqual(banco.ler().length, 1);
  assert.throws(() => banco.adicionar({ titulo: '', artista: 'A', ano: 2000 }), /Título/);
  assert.throws(() => banco.adicionar({ titulo: 'T', artista: '', ano: 2000 }), /Artista/);
  assert.throws(() => banco.adicionar({ titulo: 'T', artista: 'A', ano: 'abc' }), /Ano/);
});

test('remover apaga pelo id e persiste', () => {
  const banco = bancoTemporario([{ id: 'x', titulo: 'X', artista: 'Y', ano: 2000 }]);
  banco.remover('x');
  assert.strictEqual(banco.ler().length, 0);
});

test('seed real tem 40 músicas válidas com ids únicos', () => {
  const seed = require('../data/musicas.json');
  assert.strictEqual(seed.length, 40);
  const ids = new Set(seed.map((m) => m.id));
  assert.strictEqual(ids.size, 40);
  for (const m of seed) {
    assert.ok(m.titulo.trim() && m.artista.trim() && Number.isInteger(m.ano));
  }
});
