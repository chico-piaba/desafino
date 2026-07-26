'use strict';
// Logo do Hum-a-Tune: injetada inline (SVG usa a fonte da página) em todo
// elemento com a classe .logo-humatune. Paleta neo-retrô do jogo.
(function () {
  const SVG = `
<svg viewBox="0 0 600 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hum-a-Tune"
     style="display:block;height:100%;width:auto;max-width:100%">
  <g transform="rotate(-6 60 62)">
    <rect x="16" y="16" width="96" height="96" rx="24" fill="#3c2f2f"/>
    <rect x="10" y="10" width="96" height="96" rx="24" fill="#fe7ef0" stroke="#3c2f2f" stroke-width="4"/>
    <!-- nota musical cantarolando -->
    <path d="M62 78 V32" stroke="#3c2f2f" stroke-width="6" stroke-linecap="round"/>
    <path d="M62 32 q 22 2 24 22 q -4 -10 -24 -9 z" fill="#3adfff" stroke="#3c2f2f" stroke-width="3" stroke-linejoin="round"/>
    <ellipse cx="46" cy="80" rx="16" ry="13" fill="#f9c629" stroke="#3c2f2f" stroke-width="4"/>
    <!-- carinha: olhos fechados felizes + boquinha -->
    <path d="M38 78 q 3.5 -4.5 7 0" stroke="#3c2f2f" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M48 78 q 3.5 -4.5 7 0" stroke="#3c2f2f" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="46.5" cy="85.5" rx="3.2" ry="2.5" fill="#3c2f2f"/>
    <!-- ondas do "hummm" -->
    <path d="M84 74 q 7 -7 0 -14" stroke="#3c2f2f" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M92 79 q 12 -12 0 -24" stroke="#3c2f2f" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  </g>
  <text x="136" y="74" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="800"
        font-style="italic" font-size="54" fill="#3c2f2f" letter-spacing="-1">Hum-a-Tune</text>
  <path d="M140 94 q 18 10 36 0 t 36 0 t 36 0 t 36 0 t 36 0 t 36 0 t 36 0 t 36 0"
        stroke="#3adfff" stroke-width="5" fill="none" stroke-linecap="round"/>
</svg>`;

  function inserir() {
    for (const el of document.querySelectorAll('.logo-humatune')) el.innerHTML = SVG;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inserir);
  } else {
    inserir();
  }
})();
