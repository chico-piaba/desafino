'use strict';
// Alinha as cartas classificadas pelo modelo mais permissivo à distribuição do
// modelo mais criterioso. Só mexe nas cartas da faixa recalibrada; as demais
// ficam intactas, porque a régua delas é a de referência.
const fs = require('fs');
const path = require('path');
const { recalibrar, contarPalavras } = require('../src/recalibrar');

const RAIZ = path.join(__dirname, '..');
const banco = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'musicas.json'), 'utf8'));
const refIds = new Set(Object.keys(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))));

const referencia = banco.filter((c) => refIds.has(c.id) && c.dificuldade);
const paraAjustar = banco.filter((c) => !refIds.has(c.id) && c.dificuldade);

const conta = (lista) => {
  const d = { 1: 0, 2: 0, 3: 0 };
  for (const c of lista) d[c.dificuldade] += 1;
  return d;
};
const frac = (d, t) => ({ 1: d[1] / t, 2: d[2] / t, 3: d[3] / t });
const mostrar = (rot, d, t) =>
  console.log(`  ${rot.padEnd(24)} ` + [1, 2, 3].map((n) => `${n}=${Math.round(d[n] * 100 / t)}%`).join('  ')
    + `   média ${([1,2,3].reduce((s,n)=>s+n*d[n],0)/t).toFixed(2)}`);

const dRef = conta(referencia);
const dAntes = conta(paraAjustar);
console.log('ANTES');
mostrar('referência (120b)', dRef, referencia.length);
mostrar('a ajustar (20b)', dAntes, paraAjustar.length);

const alvo = frac(dRef, referencia.length);
const mudancas = recalibrar(paraAjustar, alvo);
for (const c of banco) {
  if (mudancas.has(c.id)) c.dificuldade = mudancas.get(c.id);
}

console.log(`\n${mudancas.size} cartas mudaram de nível (${Math.round(mudancas.size * 100 / paraAjustar.length)}% da faixa)`);
console.log('\nDEPOIS');
mostrar('referência (intacta)', dRef, referencia.length);
mostrar('ajustada', conta(paraAjustar), paraAjustar.length);
mostrar('BANCO INTEIRO', conta(banco.filter((c) => c.dificuldade)), banco.filter((c) => c.dificuldade).length);

console.log('\nExemplos de promoção (as mais duras do nível):');
let n = 0;
for (const c of banco) {
  if (!mudancas.has(c.id) || n >= 5) continue;
  console.log(`  → ${mudancas.get(c.id)}  ${c.titulo} — ${c.artista} (${contarPalavras(c.titulo)} palavras)`);
  n += 1;
}

fs.writeFileSync(path.join(RAIZ, 'data', 'musicas.json'), JSON.stringify(banco, null, 2) + '\n');
console.log('\nBanco gravado.');
