'use strict';

function interpretar(titulo, snippet) {
  const m = titulo.match(/^(.*?)\s*\((?:canção|música)(?:\s+de\s+(.+?))?\)$/i);
  const texto = String(snippet || '').replace(/<[^>]+>/g, '');
  const anoMatch = texto.match(/\b(?:19|20)\d{2}\b/);
  return {
    titulo: m ? m[1] : titulo,
    artista: m && m[2] ? m[2] : null,
    ano: anoMatch ? Number(anoMatch[0]) : null,
    resumo: texto,
  };
}

async function buscar(termo) {
  const url =
    'https://pt.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=8&srsearch=' +
    encodeURIComponent(`${termo} canção`);
  const resposta = await fetch(url, { headers: { 'User-Agent': 'desafino-prototipo' } });
  if (!resposta.ok) throw new Error(`Wikipedia respondeu ${resposta.status}`);
  const dados = await resposta.json();
  return dados.query.search.map((r) => interpretar(r.title, r.snippet));
}

module.exports = { interpretar, buscar };
