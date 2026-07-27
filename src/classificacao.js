'use strict';
// Validação das fichas devolvidas pelo classificador. Fica separada do script
// que fala com a API para poder ser testada sem rede e sem chave.
const { normalizar } = require('./texto');

const TIPOS = ['musica', 'filme'];

// Vocabulário fechado: tag fora desta lista é descartada em silêncio, senão o
// modelo inventa rótulo novo a cada lote e os baralhos param de casar.
const TAGS = [
  'nacional', 'internacional',
  'samba', 'sertanejo', 'rock', 'mpb', 'pop', 'forro', 'pagode', 'rap',
  'axe', 'funk', 'reggae', 'romantica', 'infantil', 'trilha-sonora',
];

function saneiaTags(bruto) {
  if (!Array.isArray(bruto)) return [];
  const vistas = new Set();
  for (const t of bruto) {
    const limpa = normalizar(t).replace(/\s+/g, '-');
    if (TAGS.includes(limpa)) vistas.add(limpa);
  }
  // Nacional e internacional são excludentes; na dúvida o modelo marca as duas.
  if (vistas.has('nacional') && vistas.has('internacional')) vistas.delete('internacional');
  return [...vistas];
}

// A dica não pode conter o título nem o artista: seria entregar de graça o que
// a forca e a dica de cantor cobram caro.
// Palavras comuns demais para acusar vazamento sozinhas: aparecem em qualquer
// frase e reprovariam dica boa.
const VAZIAS = new Set([
  'para', 'como', 'mais', 'muito', 'quando', 'onde', 'todo', 'toda', 'pelo',
  'pela', 'esse', 'essa', 'isso', 'ainda', 'sobre', 'entre', 'sem', 'com',
]);

// Palavras tão frequentes em português que sozinhas não entregam nada. Um título
// feito só delas ("Coisas da Vida") não tem dica evocativa possível se cada uma
// reprovar isolada — mas "sorte" em "Sorte Grande" entrega metade da resposta,
// então a lista é curta e só de genéricos de verdade.
const COMUNS = new Set([
  'amor', 'vida', 'tudo', 'coisa', 'coisas', 'homem', 'mulher', 'noite', 'dia',
  'dias', 'tempo', 'mundo', 'gente', 'casa', 'hora', 'olhos', 'coracao', 'samba',
  'cada', 'nada', 'alguem', 'voce', 'amigo', 'nome', 'anos', 'paixao',
]);

function palavrasFortes(alvo) {
  return alvo.split(' ').filter((p) => p.length >= 4 && !VAZIAS.has(p));
}

// Duas regras, porque uma só não serve para os dois casos:
//   palavra DISTINTIVA do título sozinha já vaza — "celebrando a boa sorte" para
//     o título "Sorte Grande" entrega metade da resposta;
//   palavra COMUM só vaza acompanhada das outras — exigir que "vida" não apareça
//     numa dica para "Coisas da Vida" não deixaria dica nenhuma possível.
// Para o artista vale o casamento completo: "Djavan" isolado reprovaria dica boa.
function dicaVazada(dica, carta) {
  const d = normalizar(dica);
  if (!d) return 'vazia';
  const presentes = new Set(d.split(' '));

  const titulo = normalizar(carta.titulo);
  if (titulo && d.includes(titulo)) return 'contém o título';
  const doTitulo = palavrasFortes(titulo);
  const naDica = doTitulo.filter((p) => presentes.has(p));
  // Palavra distintiva sozinha já vaza. Palavra comum só vaza se as outras do
  // título também aparecerem — senão título genérico não admitiria dica nenhuma.
  const distintiva = naDica.find((p) => !COMUNS.has(p));
  if (distintiva) return `contém "${distintiva}" do título`;
  if (naDica.length && naDica.length === doTitulo.length) {
    return 'contém o título inteiro, palavra por palavra';
  }

  const artista = normalizar(carta.artista);
  if (artista && d.includes(artista)) return 'contém o artista';
  const doArtista = palavrasFortes(artista);
  if (doArtista.length && doArtista.every((p) => presentes.has(p))) return 'contém o artista';

  return null;
}

function validarFicha(ficha, carta) {
  const problemas = [];
  if (!ficha || typeof ficha !== 'object') return { ok: false, problemas: ['ficha ausente'] };

  const tipo = TIPOS.includes(ficha.tipo) ? ficha.tipo : 'musica';
  const tags = saneiaTags(ficha.tags);
  if (!tags.length) problemas.push('sem tag válida');

  const dificuldade = Number(ficha.dificuldade);
  if (![1, 2, 3].includes(dificuldade)) problemas.push('dificuldade fora de 1-3');

  const dica = String(ficha.dica || '').trim();
  const vazamento = dicaVazada(dica, carta);
  if (vazamento) problemas.push(`dica ${vazamento}`);
  else if (dica.length > 160) problemas.push('dica longa demais');

  if (problemas.length) return { ok: false, problemas };
  return { ok: true, campos: { tipo, tags, dificuldade, dica } };
}

module.exports = { TAGS, TIPOS, saneiaTags, dicaVazada, validarFicha };
