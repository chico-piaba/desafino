'use strict';
// Classifica as cartas de data/musicas.json em tipo, tags, dificuldade e dica,
// usando a API da Groq (compatível com OpenAI). Reexecutável: só processa carta
// que ainda não tem ficha aceita. Uso:
//   node scripts/classificar.js            processa tudo que falta
//   node scripts/classificar.js --modelos  lista os modelos disponíveis
//   node scripts/classificar.js --limite 40  processa só as 40 primeiras
const fs = require('fs');
const path = require('path');
const { validarFicha, TAGS } = require('../src/classificacao');

const RAIZ = path.join(__dirname, '..');
const CAMINHO_BANCO = path.join(RAIZ, 'data', 'musicas.json');
const CAMINHO_FICHAS = path.join(RAIZ, 'data', 'classificacao.json');
const API = 'https://api.groq.com/openai/v1';
// fetch do Node não tem timeout: uma requisição pendurada no pool de conexões
// espera para sempre, sem socket visível e sem erro. Já travou uma execução
// inteira por 40 minutos — o teto abaixo transforma isso numa tentativa perdida.
const TIMEOUT_MS = 90000;
const LOTE = 10;
const PAUSA_MS = 1200;
const TENTATIVAS = 4;

// .env sem dependência: só KEY=valor, uma por linha.
function carregarEnv() {
  const arquivo = path.join(RAIZ, '.env');
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const pausar = (ms) => new Promise((r) => setTimeout(r, ms));

async function chamar(caminho, corpo) {
  const chave = process.env.GROQ_API_KEY;
  if (!chave) throw new Error('Falta GROQ_API_KEY (ponha em .env na raiz do projeto)');
  const opcoes = {
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (corpo) {
    opcoes.method = 'POST';
    opcoes.body = JSON.stringify(corpo);
  }
  const r = await fetch(API + caminho, opcoes);
  if (!r.ok) {
    const erro = new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    erro.status = r.status;
    throw erro;
  }
  return r.json();
}

async function escolherModelo() {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL;
  const { data } = await chamar('/models');
  const ids = data.map((m) => m.id).filter((id) => !/whisper|tts|guard|vision/i.test(id));
  // Prefere um modelo grande de instrução; cai no primeiro disponível se não achar.
  const preferido = ids.find((id) => /70b|maverick|versatile/i.test(id)) || ids[0];
  if (!preferido) throw new Error('Nenhum modelo de texto disponível na conta');
  return preferido;
}

const INSTRUCOES = `Você classifica cartas de um jogo de festa brasileiro em que uma pessoa
cantarola ou faz mímica e a outra tenta adivinhar o título.

Para CADA carta devolva:

"tipo": "musica"

"tags": lista escolhida SOMENTE desta lista: ${TAGS.join(', ')}.
Inclua sempre "nacional" OU "internacional" (nunca as duas), mais os gêneros que couberem.

"dificuldade": 1, 2 ou 3 — quão difícil é o parceiro chegar no TÍTULO tendo só a
melodia cantarolada. Considere, nesta ordem:
  1. Fama no Brasil. Sucesso que não tocou aqui é difícil mesmo sendo famoso lá fora.
  2. A melodia carrega sozinha? Rap, funk e faixas cujo apelo é a letra ou a batida
     são DIFÍCEIS mesmo sendo ícones. Balada com refrão marcante é fácil.
  3. O título aparece no refrão? Se sim, fica bem mais fácil.
  4. Título genérico ou regravação famosa confunde, então é mais difícil.
Âncoras: 1 = Evidências, Garota de Ipanema, Ilariê, Bohemian Rhapsody.
2 = Nem um Dia, Comfortably Numb. 3 = Diário de um Detento, Alvorada.

"dica": UMA frase curta em português (até 140 caracteres) que evoque a CENA, o CLIMA
ou o TEMA da música, para ser comprada como pista no jogo.
REGRAS DURAS da dica:
- NÃO afirme fato nenhum: nada de ano, estúdio, prêmio, história de bastidor, quem
  compôs. Só o que a música evoca. Fato inventado é pior que dica fraca.
- NÃO use nenhuma palavra do título nem o nome do artista.
- NÃO use SINÔNIMO nem DEFINIÇÃO do título. Esta é a regra mais violada. Exemplos
  do que NÃO fazer:
    "Festa"        -> proibido "celebração", "balada", "comemoração"
    "Sozinho"      -> proibido "solidão", "isolamento"
    "Aquarela"     -> proibido descrever tinta, pincel ou cores no papel
    "Sorte Grande" -> proibido "sorte", mesmo sem "grande"
  Se der para adivinhar o título traduzindo uma palavra da dica, ela está errada.
- Escreva português correto, sem erro de concordância.
- Descreva a CENA ou o SENTIMENTO, nunca o significado do título.
- Escreva como quem descreve a cena sem dizer o nome. Exemplo para "Evidências":
  "Um homem tentando negar o óbvio e se entregando na frase seguinte."

Responda SÓ com JSON válido: {"fichas":[{"id":"...","tipo":"...","tags":[...],"dificuldade":N,"dica":"..."}]}`;

async function classificarLote(modelo, cartas) {
  const lista = cartas.map((c) => `${c.id} | ${c.titulo} | ${c.artista} | ${c.ano}${c.genero ? ' | ' + c.genero : ''}`).join('\n');
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const r = await chamar('/chat/completions', {
        model: modelo,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: INSTRUCOES },
          { role: 'user', content: `Devolva EXATAMENTE ${cartas.length} fichas, uma por carta, com o id exato.\n\nCartas (id | título | artista | ano | gênero):\n${lista}` },
        ],
      });
      const texto = r.choices[0].message.content;
      const fichas = JSON.parse(texto).fichas;
      if (!Array.isArray(fichas)) throw new Error('resposta sem lista "fichas"');
      return fichas;
    } catch (e) {
      const esperar = e.status === 429 ? PAUSA_MS * 5 * tentativa : PAUSA_MS * tentativa;
      if (tentativa === TENTATIVAS) throw e;
      const causa = e.name === 'TimeoutError' ? `sem resposta em ${TIMEOUT_MS / 1000}s` : e.message.slice(0, 120);
      console.error(`  ! tentativa ${tentativa}: ${causa} — aguardando ${esperar}ms`);
      await pausar(esperar);
    }
  }
}

async function main() {
  carregarEnv();
  const args = process.argv.slice(2);

  if (args.includes('--modelos')) {
    const { data } = await chamar('/models');
    for (const m of data) console.log(' ', m.id);
    return;
  }

  const banco = JSON.parse(fs.readFileSync(CAMINHO_BANCO, 'utf8'));
  const fichas = fs.existsSync(CAMINHO_FICHAS)
    ? JSON.parse(fs.readFileSync(CAMINHO_FICHAS, 'utf8'))
    : {};

  let pendentes = banco.filter((c) => !fichas[c.id]);
  const iLimite = args.indexOf('--limite');
  if (iLimite !== -1) pendentes = pendentes.slice(0, Number(args[iLimite + 1]) || 20);

  if (!pendentes.length) {
    console.log(`Nada a fazer: as ${banco.length} cartas já têm ficha.`);
    return;
  }

  const modelo = await escolherModelo();
  console.log(`Modelo: ${modelo}\nCartas pendentes: ${pendentes.length} (lotes de ${LOTE})\n`);

  let aceitas = 0;
  let recusadas = 0;
  for (let i = 0; i < pendentes.length; i += LOTE) {
    const lote = pendentes.slice(i, i + LOTE);
    const porId = new Map(lote.map((c) => [c.id, c]));
    let resposta;
    try {
      resposta = await classificarLote(modelo, lote);
    } catch (e) {
      console.error(`lote ${i / LOTE + 1}: FALHOU — ${e.message.slice(0, 160)}`);
      continue;
    }
    for (const ficha of resposta) {
      const carta = porId.get(ficha.id);
      if (!carta) continue; // id inventado pelo modelo
      const r = validarFicha(ficha, carta);
      if (!r.ok) {
        recusadas += 1;
        console.error(`  recusada ${carta.titulo}: ${r.problemas.join('; ')}`);
        continue;
      }
      fichas[carta.id] = r.campos;
      aceitas += 1;
    }
    // Grava a cada lote: interromper no meio não perde o que já foi feito.
    fs.writeFileSync(CAMINHO_FICHAS, JSON.stringify(fichas, null, 2) + '\n');
    console.log(`lote ${Math.floor(i / LOTE) + 1}/${Math.ceil(pendentes.length / LOTE)} — aceitas ${aceitas}, recusadas ${recusadas}`);
    await pausar(PAUSA_MS);
  }

  console.log(`\nFichas em ${path.relative(RAIZ, CAMINHO_FICHAS)}: ${Object.keys(fichas).length} de ${banco.length} cartas.`);
  console.log('As recusadas continuam pendentes — rode de novo para tentar outra vez.');
  console.log('Para gravar no banco: node scripts/aplicar-classificacao.js');
}

main().catch((e) => {
  console.error('Falhou:', e.message);
  process.exit(1);
});
