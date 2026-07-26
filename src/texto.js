'use strict';

// Artigos que o povo engole ou acrescenta sem pensar ao dizer um título.
const ARTIGOS = ['o', 'a', 'os', 'as', 'the'];

function normalizar(texto) {
  const limpo = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos (combinantes, pós-NFD)
    .replace(/\([^)]*\)/g, ' ') // "(Ao Vivo)", "(Remix)"
    .replace(/-/g, ' ') // hífens viram espaço
    .replace(/[^a-z0-9\s]/g, '') // outros pontuação
    .replace(/\s+/g, ' ')
    .trim();
  const partes = limpo.split(' ');
  // Só derruba o artigo se sobrar título: "A" sozinha continua sendo "a".
  if (partes.length > 1 && ARTIGOS.includes(partes[0])) partes.shift();
  return partes.join(' ');
}

function distancia(a, b) {
  // Levenshtein com duas linhas — títulos são curtos, não precisa de matriz.
  if (a === b) return 0;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }
  return anterior[b.length];
}

function pareceCerto(palpite, titulo) {
  const p = normalizar(palpite);
  const t = normalizar(titulo);
  if (!p || !t) return false;
  // Título longo tolera mais dedo gordo; teto de 3 para não virar vale-tudo.
  const limiar = Math.min(3, Math.floor(t.length / 8) + 1);
  return distancia(p, t) <= limiar;
}

module.exports = { normalizar, distancia, pareceCerto };
