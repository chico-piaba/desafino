'use strict';
// Gera/expande data/musicas.json buscando as faixas mais populares de uma
// lista curada de artistas na iTunes Search API (pública, sem chave).
// Reproduzível: mescla com o banco existente sem apagar nada; roda de novo
// quando quiser expandir. Uso: node scripts/gerar-banco.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const itunes = require('../src/itunes');

const CAMINHO = path.join(__dirname, '..', 'data', 'musicas.json');
const ALVO_TOTAL = 510;
const FAIXAS_POR_ARTISTA = 4;
const PAUSA_MS = 1000; // iTunes limita ~20 chamadas/min

// ~70% nacional / 30% internacional
const ARTISTAS = [
  // MPB / bossa / clássicos
  'Tom Jobim', 'Vinicius de Moraes', 'João Gilberto', 'Elis Regina', 'Caetano Veloso',
  'Gilberto Gil', 'Chico Buarque', 'Milton Nascimento', 'Djavan', 'Gal Costa',
  'Maria Bethânia', 'Jorge Ben Jor', 'Tim Maia', 'Toquinho', 'Fagner',
  'Marisa Monte', 'Tribalistas', 'Ana Carolina', 'Vanessa da Mata', 'Maria Gadú',
  'Seu Jorge', 'Nando Reis', 'Cássia Eller', 'Zé Ramalho', 'Alceu Valença',
  'Elba Ramalho', 'Geraldo Azevedo', 'Luiz Gonzaga', 'Dominguinhos', 'Gonzaguinha',
  // Rock nacional / pop
  'Roberto Carlos', 'Erasmo Carlos', 'Rita Lee', 'Os Mutantes', 'Raul Seixas',
  'Legião Urbana', 'Titãs', 'Os Paralamas do Sucesso', 'Barão Vermelho', 'Cazuza',
  'Skank', 'Jota Quest', 'Capital Inicial', 'Engenheiros do Hawaii', 'CPM 22',
  'Charlie Brown Jr.', 'O Rappa', 'Natiruts', 'Armandinho', 'Cidade Negra',
  'Lulu Santos', 'Kid Abelha', 'Blitz', 'Ultraje a Rigor', 'Mamonas Assassinas',
  'RPM', 'Roupa Nova', 'Ritchie', 'Biquini Cavadão', 'Pitty',
  'Los Hermanos', 'Tiago Iorc', 'Melim', 'Jão', 'Sandy & Junior',
  // Samba / pagode
  'Zeca Pagodinho', 'Alcione', 'Beth Carvalho', 'Martinho da Vila', 'Fundo de Quintal',
  'Raça Negra', 'Só Pra Contrariar', 'Exaltasamba', 'Grupo Revelação', 'Thiaguinho',
  'Péricles', 'Sorriso Maroto', 'Turma do Pagode', 'Alexandre Pires', 'Dilsinho',
  // Sertanejo
  'Chitãozinho & Xororó', 'Zezé Di Camargo & Luciano', 'Leandro & Leonardo', 'Leonardo',
  'Bruno & Marrone', 'Daniel', 'Milionário & José Rico', 'Gusttavo Lima', 'Jorge & Mateus',
  'Henrique & Juliano', 'Marília Mendonça', 'Maiara & Maraisa', 'Matheus & Kauan',
  'Zé Neto & Cristiano', 'Michel Teló', 'Luan Santana', 'Wesley Safadão', 'Ana Castela',
  // Axé / festa / funk
  'Ivete Sangalo', 'Claudia Leitte', 'Chiclete com Banana', 'É o Tchan', 'Daniela Mercury',
  'Anitta', 'Ludmilla', 'MC Kevinho', 'Falamansa', 'Gabriel o Pensador',
  // Internacionais de festa
  'Queen', 'The Beatles', 'Michael Jackson', 'Madonna', 'ABBA',
  'Bee Gees', 'Elvis Presley', 'Whitney Houston', 'Bon Jovi', 'Guns N Roses',
  'Nirvana', 'Coldplay', 'U2', 'The Police', 'a-ha',
  'Cyndi Lauper', 'Bonnie Tyler', 'Village People', 'Gloria Gaynor', 'Stevie Wonder',
  'Bruno Mars', 'Adele', 'Ed Sheeran', 'Beyoncé', 'Rihanna',
  'Shakira', 'Backstreet Boys', 'Spice Girls', 'Britney Spears', 'Wham!',
];

const SUFIXOS_RUIDO = /\s*[-–(\[]\s*(ao vivo|live|acústic[oa]|remaster(izad[oa])?(\s*\d{4})?|playback|karaok[eê]|instrumental|radio edit|single version|bonus|b[oô]nus|deluxe|feat\.?|part\.?|com |version|vers[aã]o).*$/i;

function normalizar(texto) {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function limparTitulo(titulo) {
  let limpo = String(titulo).replace(SUFIXOS_RUIDO, '').trim();
  limpo = limpo.replace(/\s*[([{][^)\]}]*$/, '').trim(); // parêntese que ficou aberto
  return limpo;
}

function slug(texto) {
  return normalizar(texto).replace(/\s+/g, '-').slice(0, 60);
}

const pausar = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const atuais = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
  const vistos = new Set(atuais.map((m) => `${normalizar(m.titulo)}|${normalizar(m.artista)}`));
  const ids = new Set(atuais.map((m) => m.id));
  const novas = [];

  for (const artista of ARTISTAS) {
    if (atuais.length + novas.length >= ALVO_TOTAL) break;
    let resultados = [];
    try {
      resultados = await itunes.buscar(artista, { limite: 12, atributo: 'artistTerm' });
    } catch (e) {
      console.error(`  ! ${artista}: ${e.message}`);
      await pausar(PAUSA_MS * 3);
      continue;
    }
    let aceitas = 0;
    for (const r of resultados) {
      if (aceitas >= FAIXAS_POR_ARTISTA) break;
      const titulo = limparTitulo(r.titulo);
      if (!titulo || titulo.length > 60) continue;
      if (!normalizar(r.artista).includes(normalizar(artista)) &&
          !normalizar(artista).includes(normalizar(r.artista))) continue;
      if (!Number.isInteger(r.ano) || r.ano < 1900 || r.ano > 2100) continue;
      const chave = `${normalizar(titulo)}|${normalizar(r.artista)}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      let id = slug(`${titulo}-${r.artista}`);
      if (!id || ids.has(id)) id = crypto.randomUUID();
      ids.add(id);
      const musica = { id, titulo, artista: r.artista, ano: r.ano };
      if (r.genero) musica.genero = r.genero;
      novas.push(musica);
      aceitas += 1;
    }
    console.log(`${artista}: +${aceitas} (total ${atuais.length + novas.length})`);
    await pausar(PAUSA_MS);
  }

  const banco = [...atuais, ...novas];
  fs.writeFileSync(CAMINHO, JSON.stringify(banco, null, 2) + '\n');
  console.log(`\nBanco salvo: ${banco.length} músicas (${novas.length} novas).`);
}

main().catch((e) => {
  console.error('Falha ao gerar banco:', e);
  process.exit(1);
});
