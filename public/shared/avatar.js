'use strict';
// Renderizador de avatar por montagem de peças, estética neo-retro.
// Funciona no browser (global DesafinoAvatar) e no Node (module.exports).
(function (raiz) {
  const TRACO = '#3c2f2f';

  const FUNDOS = ['#f9c629', '#fe7ef0', '#3adfff', '#71ba1a', '#f17716', '#9f2999', '#2ed8f8', '#ffdf92'];

  const ROSTOS = [
    '<circle cx="50" cy="54" r="30" fill="#fff8f1" stroke="TRACO" stroke-width="4"/>',
    '<rect x="22" y="26" width="56" height="56" rx="16" fill="#fff8f1" stroke="TRACO" stroke-width="4"/>',
    '<ellipse cx="50" cy="54" rx="26" ry="32" fill="#fff8f1" stroke="TRACO" stroke-width="4"/>',
    '<rect x="26" y="30" width="48" height="48" rx="24" transform="rotate(45 50 54)" fill="#fff8f1" stroke="TRACO" stroke-width="4"/>',
  ];

  const OLHOS = [
    '<circle cx="40" cy="50" r="3.5" fill="TRACO"/><circle cx="60" cy="50" r="3.5" fill="TRACO"/>',
    '<path d="M35 51 q5 -7 10 0 M55 51 q5 -7 10 0" fill="none" stroke="TRACO" stroke-width="3.5" stroke-linecap="round"/>',
    '<circle cx="40" cy="50" r="6" fill="#fff" stroke="TRACO" stroke-width="3"/><circle cx="42" cy="50" r="2.4" fill="TRACO"/><circle cx="60" cy="50" r="6" fill="#fff" stroke="TRACO" stroke-width="3"/><circle cx="62" cy="50" r="2.4" fill="TRACO"/>',
    '<path d="M35 50 h10 M55 50 h10" stroke="TRACO" stroke-width="3.5" stroke-linecap="round"/>',
    '<path d="M40 46 l1.8 3.6 4 .6 -2.9 2.8 .7 4 -3.6 -1.9 -3.6 1.9 .7 -4 -2.9 -2.8 4 -.6 z" fill="TRACO"/><path d="M60 46 l1.8 3.6 4 .6 -2.9 2.8 .7 4 -3.6 -1.9 -3.6 1.9 .7 -4 -2.9 -2.8 4 -.6 z" fill="TRACO"/>',
    '<circle cx="40" cy="50" r="3.5" fill="TRACO"/><path d="M55 51 q5 -7 10 0" fill="none" stroke="TRACO" stroke-width="3.5" stroke-linecap="round"/>',
  ];

  const BOCAS = [
    '<path d="M40 64 q10 9 20 0" fill="none" stroke="TRACO" stroke-width="3.5" stroke-linecap="round"/>',
    '<ellipse cx="50" cy="67" rx="7" ry="9" fill="TRACO"/><ellipse cx="50" cy="70" rx="4" ry="4" fill="#fe7ef0"/>',
    '<circle cx="50" cy="66" r="4.5" fill="none" stroke="TRACO" stroke-width="3.5"/>',
    '<path d="M42 66 h16" stroke="TRACO" stroke-width="3.5" stroke-linecap="round"/>',
    '<path d="M40 63 q10 9 20 0" fill="none" stroke="TRACO" stroke-width="3.5" stroke-linecap="round"/><path d="M50 66 q2 7 7 5 q-4 5 -8 -1 z" fill="#fe7ef0" stroke="TRACO" stroke-width="2.5"/>',
    '<path d="M40 63 l5 5 5 -5 5 5 5 -5" fill="none" stroke="TRACO" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  ];

  const ACESSORIOS = [
    '',
    '<path d="M38 28 L50 4 L62 28 Z" fill="#fe7ef0" stroke="TRACO" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="6" r="4" fill="#f9c629" stroke="TRACO" stroke-width="3"/>',
    '<path d="M34 26 L34 12 L42 20 L50 8 L58 20 L66 12 L66 26 Z" fill="#f9c629" stroke="TRACO" stroke-width="4" stroke-linejoin="round"/>',
    '<path d="M32 26 a18 14 0 0 1 36 0 z" fill="#3adfff" stroke="TRACO" stroke-width="4"/><path d="M66 24 h16 a4 4 0 0 1 -4 6 h-12 z" fill="#3adfff" stroke="TRACO" stroke-width="4" stroke-linejoin="round"/>',
    '<path d="M50 16 l8 -8 a6 6 0 0 1 6 8 a6 6 0 0 1 -8 6 z" fill="#fe7ef0" stroke="TRACO" stroke-width="3.5" stroke-linejoin="round"/><path d="M50 16 l-8 -8 a6 6 0 0 0 -6 8 a6 6 0 0 0 8 6 z" fill="#fe7ef0" stroke="TRACO" stroke-width="3.5" stroke-linejoin="round"/><circle cx="50" cy="16" r="4" fill="#f9c629" stroke="TRACO" stroke-width="3"/>',
    '<path d="M22 54 a28 28 0 0 1 56 0" fill="none" stroke="TRACO" stroke-width="5"/><rect x="14" y="48" width="12" height="18" rx="5" fill="#71ba1a" stroke="TRACO" stroke-width="4"/><rect x="74" y="48" width="12" height="18" rx="5" fill="#71ba1a" stroke="TRACO" stroke-width="4"/>',
    '<path d="M74 20 l2.6 5.2 5.8 .9 -4.2 4.1 1 5.8 -5.2 -2.8 -5.2 2.8 1 -5.8 -4.2 -4.1 5.8 -.9 z" fill="#f9c629" stroke="TRACO" stroke-width="3" stroke-linejoin="round"/>',
  ];

  const TAMANHOS = {
    fundo: FUNDOS.length,
    rosto: ROSTOS.length,
    olhos: OLHOS.length,
    boca: BOCAS.length,
    acessorio: ACESSORIOS.length,
  };

  function indice(avatar, chave) {
    const bruto = avatar && Number.isInteger(avatar[chave]) ? avatar[chave] : 0;
    const n = TAMANHOS[chave];
    return ((bruto % n) + n) % n;
  }

  function avatarSvg(avatar) {
    const fundo = FUNDOS[indice(avatar, 'fundo')];
    const pecas = [
      `<rect x="2" y="2" width="96" height="96" rx="18" fill="${fundo}" stroke="${TRACO}" stroke-width="4"/>`,
      ROSTOS[indice(avatar, 'rosto')],
      OLHOS[indice(avatar, 'olhos')],
      BOCAS[indice(avatar, 'boca')],
      ACESSORIOS[indice(avatar, 'acessorio')],
    ];
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${pecas.join('').replaceAll('TRACO', TRACO)}</svg>`;
  }

  function avatarAleatorio(aleatorio = Math.random) {
    const sorteio = (n) => Math.floor(aleatorio() * n);
    return {
      fundo: sorteio(TAMANHOS.fundo),
      rosto: sorteio(TAMANHOS.rosto),
      olhos: sorteio(TAMANHOS.olhos),
      boca: sorteio(TAMANHOS.boca),
      acessorio: sorteio(TAMANHOS.acessorio),
    };
  }

  const api = { avatarSvg, avatarAleatorio, TAMANHOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.DesafinoAvatar = api;
})(typeof window !== 'undefined' ? window : globalThis);
