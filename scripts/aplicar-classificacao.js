'use strict';
// Grava no banco os campos das fichas já validadas. Separado da classificação
// de propósito: dá para revisar data/classificacao.json antes de tocar no jogo.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CAMINHO_BANCO = path.join(RAIZ, 'data', 'musicas.json');
const CAMINHO_FICHAS = path.join(RAIZ, 'data', 'classificacao.json');

const banco = JSON.parse(fs.readFileSync(CAMINHO_BANCO, 'utf8'));
const fichas = JSON.parse(fs.readFileSync(CAMINHO_FICHAS, 'utf8'));

let aplicadas = 0;
for (const carta of banco) {
  const f = fichas[carta.id];
  if (!f) continue;
  carta.tipo = f.tipo;
  carta.tags = f.tags;
  carta.dificuldade = f.dificuldade;
  carta.dica = f.dica;
  aplicadas += 1;
}

// Padrão honesto para quem ficou sem ficha: não finge conhecimento que não temos.
let padrao = 0;
for (const carta of banco) {
  if (carta.dificuldade === undefined) {
    carta.tipo = carta.tipo || 'musica';
    carta.tags = carta.tags || [];
    carta.dificuldade = 2;
    padrao += 1;
  }
}

fs.writeFileSync(CAMINHO_BANCO, JSON.stringify(banco, null, 2) + '\n');
console.log(`${aplicadas} cartas classificadas, ${padrao} com padrão (dificuldade 2, sem tag).`);
