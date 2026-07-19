'use strict';

function interpretarResultado(r) {
  return {
    titulo: String(r.trackName || '').trim(),
    artista: String(r.artistName || '').trim(),
    ano: r.releaseDate ? Number(String(r.releaseDate).slice(0, 4)) : null,
    genero: r.primaryGenreName ? String(r.primaryGenreName).trim() : null,
  };
}

async function buscar(termo, { limite = 8, atributo } = {}) {
  const params = new URLSearchParams({
    term: termo,
    country: 'BR',
    media: 'music',
    entity: 'song',
    limit: String(limite),
    lang: 'pt_br',
  });
  if (atributo) params.set('attribute', atributo);
  const resposta = await fetch(`https://itunes.apple.com/search?${params}`);
  if (!resposta.ok) throw new Error(`iTunes respondeu ${resposta.status}`);
  const dados = await resposta.json();
  return (dados.results || []).map(interpretarResultado).filter((m) => m.titulo && m.artista);
}

module.exports = { buscar, interpretarResultado };
