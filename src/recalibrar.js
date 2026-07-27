'use strict';
// Recalibra uma faixa de cartas para uma distribuição-alvo de dificuldade.
//
// O problema: metade do banco foi classificada por um modelo mais permissivo, e
// a escala dos dois não bate. Mapear quantis exige saber QUAIS cartas mover, e o
// modelo devolve só 1, 2 ou 3 — sem pontuação contínua para ordenar dentro do
// nível. Sem critério de ordenação, promover cartas seria sorteio disfarçado de
// estatística: acertaria a distribuição e erraria carta por carta.
//
// A ordenação usa dois sinais que já existem no banco, de graça:
//   posição de popularidade — dentro de cada artista, a ordem das faixas no
//     arquivo é o ranking do iTunes. Faixa mais abaixo é menos conhecida, logo
//     mais difícil de cantarolar.
//   número de palavras do título — mesmo reconhecendo a melodia, o parceiro
//     precisa produzir o título exato; título longo é mais difícil de acertar.
//
// O nível do modelo continua sendo a chave primária: os sinais só desempatam
// dentro dele e decidem quem cruza a fronteira.

function contarPalavras(titulo) {
  return String(titulo)
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s/&-]+/)
    .filter((p) => p.trim()).length;
}

// Posição de cada carta dentro do grupo do seu artista, na ordem do arquivo.
function posicoesPorArtista(cartas) {
  const contagem = new Map();
  const posicao = new Map();
  for (const c of cartas) {
    const chave = String(c.artista || '').toLowerCase();
    const n = contagem.get(chave) || 0;
    contagem.set(chave, n + 1);
    posicao.set(c.id, n);
  }
  return posicao;
}

// Quanto maior, mais difícil. Escala arbitrária: só a ordem importa.
function dureza(carta, posicao) {
  return (posicao.get(carta.id) || 0) * 2 + contarPalavras(carta.titulo);
}

/**
 * @param cartas   lista de cartas a recalibrar (cada uma com id, titulo, artista, dificuldade)
 * @param alvo     fração desejada por nível, ex. { 1: 0.46, 2: 0.40, 3: 0.12 }
 * @returns Map de id -> nível novo, só para as cartas que mudaram
 */
function recalibrar(cartas, alvo) {
  const validas = cartas.filter((c) => [1, 2, 3].includes(c.dificuldade));
  if (!validas.length) return new Map();
  const posicao = posicoesPorArtista(validas);

  // Ordem: nível do modelo primeiro, dureza como desempate. Assim uma carta só
  // é promovida depois que todas as mais difíceis do mesmo nível já foram.
  const ordenadas = [...validas].sort((a, b) =>
    a.dificuldade - b.dificuldade || dureza(a, posicao) - dureza(b, posicao)
  );

  const total = ordenadas.length;
  const cortes = [
    Math.round(total * (alvo[1] || 0)),
    Math.round(total * ((alvo[1] || 0) + (alvo[2] || 0))),
  ];

  const mudancas = new Map();
  ordenadas.forEach((carta, i) => {
    const novo = i < cortes[0] ? 1 : i < cortes[1] ? 2 : 3;
    if (novo !== carta.dificuldade) mudancas.set(carta.id, novo);
  });
  return mudancas;
}

module.exports = { recalibrar, contarPalavras, dureza, posicoesPorArtista };
