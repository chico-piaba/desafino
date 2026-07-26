'use strict';

function primeiraLetra(titulo) {
  const letra = [...String(titulo)].find((c) => /[\p{L}\p{N}]/u.test(c));
  return letra ? letra.toUpperCase() : '?';
}

function gerarForca(titulo, revelarInicial) {
  let primeira = true;
  return [...String(titulo).trim()]
    .map((c) => {
      if (/[\p{L}\p{N}]/u.test(c)) {
        const ehPrimeira = primeira;
        primeira = false;
        if (ehPrimeira && revelarInicial) return c.toUpperCase();
        return '_';
      }
      return c; // espaços e pontuação ficam visíveis, como na forca
    })
    .join(' ');
}

function conteudoDica(musica, tipo, dicasCompradas = []) {
  if (tipo === 'cantor') return musica.artista;
  if (tipo === 'ano') return String(musica.ano);
  if (tipo === 'decada') {
    const decada = Math.floor(musica.ano / 10) * 10;
    return decada >= 2000 ? `Anos ${decada}` : `Anos ${decada % 100}`;
  }
  if (tipo === 'genero') {
    if (!musica.genero) throw new Error('Dica indisponível para esta música');
    return musica.genero;
  }
  if (tipo === 'inicialDoTitulo') return `Começa com "${primeiraLetra(musica.titulo)}"`;
  if (tipo === 'forca') {
    const temInicial = dicasCompradas.some((d) => d.tipo === 'inicialDoTitulo');
    return gerarForca(musica.titulo, temInicial);
  }
  throw new Error('Dica desconhecida');
}

function dicasDisponiveis(config, musica) {
  return Object.fromEntries(
    Object.entries(config.dicas).filter(([tipo]) => tipo !== 'genero' || Boolean(musica.genero))
  );
}

module.exports = { primeiraLetra, gerarForca, conteudoDica, dicasDisponiveis };
