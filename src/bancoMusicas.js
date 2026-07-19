'use strict';
const fs = require('fs');
const crypto = require('crypto');

function criarBanco(caminho) {
  const ler = () => JSON.parse(fs.readFileSync(caminho, 'utf8'));
  const salvar = (musicas) => fs.writeFileSync(caminho, JSON.stringify(musicas, null, 2) + '\n');

  function adicionar({ titulo, artista, ano, genero }) {
    if (!titulo || !String(titulo).trim()) throw new Error('Título obrigatório');
    if (!artista || !String(artista).trim()) throw new Error('Artista obrigatório');
    ano = Number(ano);
    if (!Number.isInteger(ano) || ano < 1900 || ano > 2100) throw new Error('Ano inválido');
    const musica = { id: crypto.randomUUID(), titulo: String(titulo).trim(), artista: String(artista).trim(), ano };
    if (genero && String(genero).trim()) musica.genero = String(genero).trim();
    salvar([...ler(), musica]);
    return musica;
  }

  function remover(id) {
    salvar(ler().filter((m) => m.id !== id));
  }

  return { ler, adicionar, remover };
}

module.exports = { criarBanco };
