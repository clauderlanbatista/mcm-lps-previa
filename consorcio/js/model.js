/**
 * Modelo do simulador de consórcio "Dupla Saída".
 * Fórmulas e premissas idênticas às da LP de referência (ver docs/analise-lp-referencia.md §5).
 * Premissas-base: HS Consórcios.
 */
(function () {
  'use strict';

  // ---- Premissas do plano-base ----
  const CARTA_BASE = 500000;
  const PRAZO = 220; // meses
  const PARCELA_REDUZIDA_BASE = 1397.5; // 50% da parcela integral de R$ 2.795
  const CESSAO = 0.3; // cessão no secundário = 30% do crédito atualizado
  const OBRIGACAO = 1.23; // crédito + 22% taxa de administração + 1% fundo de reserva
  const SEGURO = 0.000555; // seguro mensal pós-contemplação sobre o crédito atualizado
  const LIQUIDACAO = 10 / 30; // liquidação da cessão em 10 dias (em meses)
  const MES_MAX = 219;
  const MES_REF = 36; // mês de referência da leitura textual
  const INCC_PADRAO = 0.05;
  const LOC_LONGA = 3000 / CARTA_BASE; // 0,6% a.m.
  const LOC_CURTA = 6000 / CARTA_BASE; // 1,2% a.m.

  // ---- Opções ----
  const CARTAS = [
    { value: '500000', label: 'R$ 500 mil', min: 500000 },
    { value: '750000', label: 'R$ 750 mil', min: 750000 },
    { value: '1000000', label: 'R$ 1 milhão', min: 1000000 },
    { value: '1500000', label: 'R$ 1,5 milhão', min: 1500000 },
    { value: '2000000', label: 'R$ 2 milhões', min: 2000000 },
  ];

  const APORTES = [
    { value: 'ate_1500', label: 'Até R$ 1.500', min: 0, max: 1500 },
    { value: '1500_3000', label: 'Entre R$ 1.500 e R$ 3.000', min: 1500, max: 3000 },
    { value: '3000_6000', label: 'Entre R$ 3.000 e R$ 6.000', min: 3000, max: 6000 },
    { value: '6000_10000', label: 'Entre R$ 6.000 e R$ 10.000', min: 6000, max: 10000 },
    { value: '10000_acima', label: 'Acima de R$ 10.000', min: 10000, max: null },
  ];

  const OBJETIVOS = [
    { value: 'monetizar', label: 'Monetizar a contemplação', nota: 'Avaliar a cessão da cota depois de contemplado.' },
    { value: 'patrimonio', label: 'Construir patrimônio que gere renda', nota: 'Usar o crédito para adquirir imóvel e avaliar locação.' },
    { value: 'ambas', label: 'Ainda estou avaliando as duas', nota: 'Quero entender como cada caminho se comporta.' },
    { value: 'uso_proprio', label: 'Comprar um imóvel para uso próprio', nota: 'Moradia ou uso da família, não investimento.' },
  ];

  const PATRIMONIOS = [
    { value: '0_50k', label: 'Abaixo de R$ 50 mil' },
    { value: '50k_300k', label: 'Entre R$ 50 mil e R$ 300 mil' },
    { value: '300k_500k', label: 'Entre R$ 300 mil e R$ 500 mil' },
    { value: '500k_1m', label: 'Entre R$ 500 mil e R$ 1 milhão' },
    { value: '1m_5m', label: 'Entre R$ 1 milhão e R$ 5 milhões' },
    { value: '5m_10m', label: 'Entre R$ 5 milhões e R$ 10 milhões' },
    { value: '10m_30m', label: 'Entre R$ 10 milhões e R$ 30 milhões' },
    { value: '30m_50m', label: 'Entre R$ 30 milhões e R$ 50 milhões' },
    { value: '50m_acima', label: 'Acima de R$ 50 milhões' },
  ];

  const INCCS = [
    { value: 0.03, label: '3%' },
    { value: 0.05, label: '5%' },
    { value: 0.075, label: '7,5%' },
    { value: 0.1, label: '10%' },
  ];

  const LOCACOES = [
    { value: LOC_LONGA, label: '0,6% a.m. · longa temporada' },
    { value: 0.008, label: '0,8% a.m.' },
    { value: 0.01, label: '1,0% a.m.' },
    { value: LOC_CURTA, label: '1,2% a.m. · curta temporada' },
    { value: 0.015, label: '1,5% a.m.' },
  ];

  const RESSALVAS = [
    'Simulação educacional, com premissas simplificadas. Não considera imposto de renda, ITBI, cartório, vacância nem custos de aquisição.',
    'A contemplação depende de sorteio ou lance e não tem data garantida. Nenhum cenário aqui supõe que ela vá acontecer em um mês específico.',
    'Não há garantia de liquidez, de preço ou de comprador para a cota no mercado secundário, e a transferência depende da anuência da administradora.',
  ];

  // ---- Formatação ----
  const moeda = (v, casas = 0) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: casas }).format(v);
  const pct = (v, casas = 1) =>
    new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);

  const achar = (lista, value) => lista.find((o) => o.value === value);

  // ---- Núcleo ----
  const fatorIncc = (mes, incc) => Math.pow(1 + incc, Math.floor((mes - 1) / 12));
  const creditoAtualizado = (mes, carta, incc) => carta * fatorIncc(mes, incc);
  const parcela = (mes, carta, incc) => PARCELA_REDUZIDA_BASE * (carta / CARTA_BASE) * fatorIncc(mes, incc);
  const parcelaInicial = (carta) => PARCELA_REDUZIDA_BASE * (carta / CARTA_BASE);

  function desembolsado(mes, carta, incc) {
    let total = 0;
    for (let m = 1; m <= mes; m++) total += parcela(m, carta, incc);
    return total;
  }

  /** TIR por bissecção sobre fluxos { t, valor }. Retorna null se não houver raiz. */
  function tir(fluxos) {
    const vpl = (taxa) => fluxos.reduce((s, f) => s + f.valor / Math.pow(1 + taxa, f.t), 0);
    let lo = -0.95, hi = 1, vLo = vpl(lo), vHi = vpl(hi), n = 0;
    while (vLo * vHi > 0 && hi < 1024 && n < 30) { hi *= 2; vHi = vpl(hi); n++; }
    if (vLo * vHi > 0) return null;
    for (let i = 0; i < 140; i++) {
      const mid = (lo + hi) / 2, v = vpl(mid);
      if (Math.abs(v) < 1e-8) return mid;
      if (vLo * v <= 0) hi = mid; else { lo = mid; vLo = v; }
    }
    return (lo + hi) / 2;
  }

  /** Saída A: cessão da carta contemplada. */
  function saidaA(mes, carta, incc) {
    const credito = creditoAtualizado(mes, carta, incc);
    const venda = credito * CESSAO;
    const desemb = desembolsado(mes, carta, incc);
    const resultado = venda - desemb;
    const fluxos = [];
    for (let m = 1; m <= mes; m++) fluxos.push({ t: m - 1, valor: -parcela(m, carta, incc) });
    fluxos.push({ t: mes - 1 + LIQUIDACAO, valor: venda });
    return {
      creditoAtualizado: credito,
      valorDeVenda: venda,
      desembolsado: desemb,
      resultado,
      retornoSobreDesembolso: resultado / desemb,
      tirMensal: tir(fluxos),
    };
  }

  /** Saída B: crédito no imóvel, avaliando a renda. */
  function saidaB(mes, carta, incc, locacao) {
    const credito = creditoAtualizado(mes, carta, incc);
    const desemb = desembolsado(mes, carta, incc);
    const saldo = Math.max(0, credito * OBRIGACAO - desemb);
    const mesesRestantes = Math.max(1, PRAZO - mes);
    const parcelaPos = saldo / mesesRestantes + credito * SEGURO;
    const aluguel = credito * locacao;
    return {
      creditoAtualizado: credito,
      saldoRemanescente: saldo,
      mesesRestantes,
      parcelaPos,
      aluguel,
      cobertura: aluguel / parcelaPos,
      aporteMensal: parcelaPos - aluguel,
      ehQuitacao: mesesRestantes <= 12,
    };
  }

  /** Série do gráfico: mês 1, múltiplos de `passo` e mês final. */
  function serie(carta, incc, passo = 3) {
    const pontos = [];
    let acumulado = 0;
    for (let m = 1; m <= MES_MAX; m++) {
      acumulado += parcela(m, carta, incc);
      if (m === 1 || m % passo === 0 || m === MES_MAX) {
        pontos.push({ mes: m, venda: creditoAtualizado(m, carta, incc) * CESSAO, desembolsado: acumulado });
      }
    }
    return pontos;
  }

  /** Primeiro mês em que a cessão deixa de ter resultado bruto positivo. */
  function mesEmQueACessaoZera(carta, incc) {
    let acumulado = 0;
    for (let m = 1; m <= MES_MAX; m++) {
      acumulado += parcela(m, carta, incc);
      if (creditoAtualizado(m, carta, incc) * CESSAO - acumulado < 0) return m;
    }
    return null;
  }

  function cabimento(parcelaIni, aporteValue) {
    const faixa = achar(APORTES, aporteValue);
    if (!faixa) return 'no_limite';
    const min = faixa.min ?? 0;
    const max = faixa.max ?? Infinity;
    return parcelaIni <= min ? 'cabe' : parcelaIni <= max ? 'no_limite' : 'nao_cabe';
  }

  function maiorCartaQueCabe(aporteValue) {
    const cabem = CARTAS.map((c) => c.min).filter((v) => cabimento(parcelaInicial(v), aporteValue) === 'cabe');
    return cabem.length ? Math.max(...cabem) : null;
  }

  /** Leitura personalizada exibida após o formulário. */
  function leitura(respostas, incc = INCC_PADRAO) {
    const carta = Number(achar(CARTAS, respostas.carta)?.min ?? CARTA_BASE);
    const parcelaIni = parcelaInicial(carta);
    const cab = cabimento(parcelaIni, respostas.aporte);
    const maior = maiorCartaQueCabe(respostas.aporte);
    const desembRef = desembolsado(MES_REF, carta, incc);
    const creditoRef = creditoAtualizado(MES_REF, carta, incc);
    const alavancagem = desembRef / creditoRef;
    const mesZero = mesEmQueACessaoZera(carta, incc);
    const destaque =
      respostas.objetivo === 'uso_proprio' ? 'fora_do_perfil'
      : respostas.objetivo === 'monetizar' ? 'venda'
      : respostas.objetivo === 'patrimonio' ? 'patrimonio'
      : 'ambas';

    const p = [];

    if (cab === 'nao_cabe') {
      p.push(
        `A parcela reduzida de uma carta de ${moeda(carta)} começa em ${moeda(parcelaIni)} por mês, e isso passa do que você indicou que pode comprometer. ` +
        (maior
          ? `No que você declarou, a maior carta que cabe com folga é a de ${moeda(maior)}.`
          : `Nenhuma das cartas desta faixa cabe no que você declarou — e entrar apertado numa estrutura de ${MES_MAX + 1} meses é o erro mais caro que dá para cometer aqui.`)
      );
    } else if (cab === 'no_limite') {
      p.push(`A parcela reduzida dessa carta começa em ${moeda(parcelaIni)} por mês e fica no limite do que você indicou. Ela ainda é reajustada todo ano pelo INCC, então o aperto tende a aumentar antes da contemplação, não a diminuir.`);
    } else {
      p.push(`A parcela reduzida dessa carta começa em ${moeda(parcelaIni)} por mês e cabe no que você indicou. Ela é reajustada anualmente pelo INCC, então convém dimensionar com folga, e não no limite.`);
    }

    p.push(`Em ${MES_REF} meses você terá desembolsado ${moeda(desembRef)}, com um crédito corrigido de ${moeda(creditoRef)} na mão. São ${pct(alavancagem)} do valor. Isso não é rendimento: é a estrutura de crédito fazendo o que ela faz — dar acesso a um valor grande com desembolso pequeno, cobrando o tempo em troca.`);

    if (destaque === 'fora_do_perfil') {
      p.push('Um aviso direto: esta estratégia não foi desenhada para quem precisa do imóvel para uso próprio. Como o crédito só é liberado na contemplação e ela não tem data, quem tem prazo para morar ou mudar costuma se frustrar. O simulador abaixo continua liberado, mas leia os dois cenários como mecânica, não como plano de compra.');
    } else {
      const a = saidaA(MES_REF, carta, incc);
      const b = saidaB(MES_REF, carta, incc, LOC_CURTA);
      if (destaque === 'venda' || destaque === 'ambas') {
        p.push(`Saída A, cessão da cota: contemplando em ${MES_REF} meses, o cenário-base estima uma venda de ${moeda(a.valorDeVenda)} contra ${moeda(a.desembolsado)} desembolsados. Esse número depende inteiramente da premissa de cessão a 30% do crédito atualizado — é a premissa mais frágil do modelo, e a que mais varia com o mercado e a negociação.`);
      }
      if (destaque === 'patrimonio' || destaque === 'ambas') {
        p.push(`Saída B, imóvel e renda: o crédito de ${moeda(b.creditoAtualizado)} compra o ativo, sobra uma parcela estimada de ${moeda(b.parcelaPos)} e um aluguel líquido estimado de ${moeda(b.aluguel)} em curta temporada — ${pct(b.cobertura, 0)} da parcela. Quanto mais tarde a contemplação, menos meses sobram para diluir o saldo: a parcela sobe e essa cobertura cai.`);
      }
    }

    if (mesZero !== null) {
      p.push(`E o ponto que quase ninguém mostra na hora de assinar: mantida a premissa de cessão a 30%, o resultado bruto da venda deixa de ser positivo por volta do mês ${mesZero}. Daí para a frente a conversa deixa de ser sobre monetizar a contemplação e passa a ser sobre o que fazer com o crédito.`);
    }

    return {
      carta,
      parcelaInicial: parcelaIni,
      cabimento: cab,
      maiorCartaQueCabe: maior,
      alavancagem,
      desembolsadoNaReferencia: desembRef,
      creditoNaReferencia: creditoRef,
      mesEmQueACessaoZera: mesZero,
      destaque,
      leitura: p,
      ressalvas: RESSALVAS,
    };
  }

  window.MCMModel = {
    CARTA_BASE, PRAZO, CESSAO, OBRIGACAO, MES_MAX, MES_REF, INCC_PADRAO, LOC_CURTA, LOC_LONGA,
    CARTAS, APORTES, OBJETIVOS, PATRIMONIOS, INCCS, LOCACOES, RESSALVAS,
    moeda, pct, achar,
    saidaA, saidaB, serie, mesEmQueACessaoZera, leitura,
  };
})();
