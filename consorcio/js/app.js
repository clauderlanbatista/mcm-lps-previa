/**
 * Diagnóstico + simulador "Dupla Saída".
 * Fluxo: carta → aporte → objetivo → patrimonio → contato → resultado (ver docs/analise-lp-referencia.md §3–§6).
 */
(function () {
  'use strict';

  const C = window.MCM_CONFIG || {};
  const M = window.MCMModel;
  const root = document.getElementById('form_simc');
  const reduzMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const digitos = (s) => String(s).replace(/\D+/g, '');

  function rolarAte(elemento) {
    if (!elemento) return;
    elemento.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------------------
  // Eventos (dataLayer)
  // ---------------------------------------------------------------------------
  // Esta página não carrega tracker nenhum: os eventos só ficam registrados no dataLayer.
  // Quando a MCM decidir sobre o consentimento de cookies, o gerenciador de consentimento passa
  // a ser o único ponto que carrega tags e lê estes eventos (CLAUDE.md §12.1).
  function track(evento, extra = {}) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: evento, lead_index: 'simc', page: C.LP_VERSION, landing_page_version: C.LP_VERSION, ...extra });
    } catch { /* ignora */ }
  }

  // ---------------------------------------------------------------------------
  // Envio para o core (packages/lead-form → POST /api/leads)
  // ---------------------------------------------------------------------------
  // UTMs, gclid/fbclid, identificadores e novas tentativas ficam por conta do lead-form.
  const LF = window.MCMLeadForm;
  const leadForm = LF.criar({ endpoint: C.API_URL, formKey: C.FORM_KEY, consentVersion: C.CONSENT_VERSION });

  /**
   * Envia uma etapa do simulador junto do contato. Todo envio é autossuficiente: se o do
   * diagnóstico se perder, o pedido de análise cria o lead sozinho.
   * Os campos de `inputs` e `outputs` são os declarados em packages/shared/src/tools/consorcio-dupla-saida.
   */
  function enviarEtapa(stage, inputs, outputs) {
    // Demonstração (ver config.js): finge a confirmação do core. `duplicado` evita registrar conversão.
    if (C.DEMONSTRACAO) return Promise.resolve({ ok: true, duplicado: true, recusado: false, status: null });
    return leadForm.enviar({
      name: S.contato.nome.trim(),
      email: S.contato.email.trim(),
      phone: S.contato.telefone,
      honeypot: S.honeypot,
      tool: { version: C.TOOL_VERSION, stage, inputs, outputs },
    });
  }

  // ---------------------------------------------------------------------------
  // Validação e máscara de telefone
  // ---------------------------------------------------------------------------
  function validarTelefone(valor) {
    // Mesma regra do servidor (vem do lead-form), mais a exigência de celular: o campo é de WhatsApp.
    // Em E.164, celular brasileiro tem 14 caracteres: +55, DDD e 9 dígitos.
    const e164 = LF.normalizarTelefoneBR(valor);
    return e164 && e164.length === 14 ? null : 'Informe um telefone válido com DDD.';
  }

  function mascararTelefone(valor) {
    const d = digitos(valor).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------
  const PASSOS = ['carta', 'aporte', 'objetivo', 'patrimonio'];
  const PERGUNTAS = {
    carta: {
      titulo: 'Que valor de crédito faz sentido para você?',
      apoio: 'É o valor da carta. Dá para mudar depois, no simulador.',
      opcoes: M.CARTAS,
    },
    aporte: {
      titulo: 'Quanto você consegue comprometer por mês?',
      apoio: 'Antes da contemplação a parcela é reduzida, e é reajustada todo ano pelo INCC. Esta resposta é o que define se a carta acima cabe.',
      opcoes: M.APORTES,
    },
    objetivo: {
      titulo: 'O que você quer da estrutura?',
      apoio: 'Define qual das duas saídas o resultado destaca primeiro.',
      opcoes: M.OBJETIVOS,
    },
    patrimonio: {
      titulo: 'Quanto você tem investido hoje?',
      apoio: 'Serve para calibrar a leitura ao seu tamanho. Última pergunta antes do resultado.',
      opcoes: M.PATRIMONIOS,
    },
  };

  const S = {
    passo: 'carta',
    respostas: {},
    contato: { nome: '', email: '', telefone: '' },
    lgpd: false,
    honeypot: '',
    erros: {},
    enviando: false,
    iniciou: false,
    analisePedida: false,
    erroAnalise: false,
    resultado: null,
    cenario: null,
  };

  const primeiroNome = () => S.contato.nome.trim().split(/\s+/)[0] || '';

  // ---------------------------------------------------------------------------
  // Renderização
  // ---------------------------------------------------------------------------
  function cabecalho(rotulo, voltarPara, progresso) {
    return `
      <div class="diag-head">
        <div class="eyebrow">${rotulo}</div>
        ${voltarPara ? `<button type="button" class="link-voltar" data-voltar="${voltarPara}">Voltar</button>` : ''}
      </div>
      <div class="progress" role="progressbar" aria-label="Progresso do diagnóstico" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progresso)}">
        <div class="progress-bar" style="width:${progresso}%"></div>
      </div>`;
  }

  function htmlPergunta(passo) {
    const i = PASSOS.indexOf(passo);
    const p = PERGUNTAS[passo];
    const progresso = ((i + 1) / (PASSOS.length + 1)) * 100;
    const opcoes = p.opcoes.map((o) => `
      <button type="button" class="opcao" data-campo="${passo}" data-valor="${esc(o.value)}" aria-pressed="${S.respostas[passo] === o.value}">
        <strong>${esc(o.label)}</strong>
        ${o.nota ? `<small>${esc(o.nota)}</small>` : ''}
      </button>`).join('');
    return `
      <div class="card card--md">
        ${cabecalho(`Pergunta ${i + 1} de ${PASSOS.length}`, i > 0 ? PASSOS[i - 1] : null, progresso)}
        <h2 class="diag-title" tabindex="-1">${esc(p.titulo)}</h2>
        <p class="nota mt-2 max-xl">${esc(p.apoio)}</p>
        <div class="opcoes">${opcoes}</div>
      </div>`;
  }

  function htmlContato() {
    const e = S.erros;
    const campo = (id, rotulo, attrs, valor, erro) => `
      <div>
        <label class="eyebrow" for="form-field-${id}">${rotulo}</label>
        <input id="form-field-${id}" class="input-texto" ${attrs} value="${esc(valor)}" aria-invalid="${!!erro}" ${erro ? `aria-describedby="erro-${id}"` : ''} />
        ${erro ? `<div class="erro" id="erro-${id}">${esc(erro)}</div>` : ''}
      </div>`;
    return `
      <div class="card card--md">
        ${cabecalho('Último passo', 'patrimonio', 100)}
        <h2 class="diag-title" tabindex="-1">Para onde eu mando a sua leitura?</h2>
        <p class="nota mt-2 max-xl">O resultado aparece nesta tela, na hora. O contato é para você poder voltar a ele depois e para o nosso time falar com você se fizer sentido.</p>
        <form class="form" novalidate data-form="contato">
          ${campo('firstname', 'Nome completo', 'name="firstname" type="text" autocomplete="name" placeholder="Seu nome"', S.contato.nome, e.nome)}
          ${campo('email', 'E-mail', 'name="email" type="email" inputmode="email" autocomplete="email" placeholder="voce@email.com"', S.contato.email, e.email)}
          ${campo('phone', 'WhatsApp', 'name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(11) 99999-9999" maxlength="16"', S.contato.telefone, e.telefone)}
          <div class="hp" aria-hidden="true">
            <label for="form-field-empresa">Empresa</label>
            <input id="form-field-empresa" name="empresa" type="text" tabindex="-1" autocomplete="off" />
          </div>
          <label class="check">
            <input type="checkbox" name="lgpd" ${S.lgpd ? 'checked' : ''} />
            <span>Autorizo o contato da MCM por e-mail e WhatsApp e concordo com o tratamento dos meus dados conforme a <a href="${esc(C.LINK_PRIVACIDADE || '#')}" target="_blank" rel="noopener noreferrer">Política de Privacidade</a> (LGPD).</span>
          </label>
          ${e.lgpd ? `<div class="erro">${esc(e.lgpd)}</div>` : ''}
          ${e.geral ? `<div class="erro" role="alert">${esc(e.geral)}</div>` : ''}
          <button type="submit" class="btn" ${S.enviando ? 'disabled' : ''}>${S.enviando ? 'Calculando...' : 'Ver o meu resultado'}</button>
          <p class="nota">Simulação educacional. Não é oferta, proposta de contratação nem recomendação de investimento.</p>
        </form>
      </div>`;
  }

  function opcoesSelect(lista, selecionado, rotulo = (o) => o.label) {
    return lista.map((o, i) => `<option value="${i}" ${i === selecionado ? 'selected' : ''}>${esc(rotulo(o))}</option>`).join('');
  }

  function htmlCta() {
    const nome = primeiroNome();
    if (S.analisePedida) {
      return `
        <div class="eyebrow">Recebido</div>
        <h3 class="h3 mt-2">${nome ? `${esc(nome)}, ` : ''}o seu cenário chegou aqui.</h3>
        <p class="body-text mt-3">Um especialista da MCM analisa o encaixe com premissas mais completas — incluindo tributos e custos que este simulador não considera — e retorna ${esc(C.SLA_RETORNO || 'em breve')}.</p>`;
    }
    return `
      <div class="eyebrow">Próximo passo</div>
      <h3 class="h3 mt-2">O simulador mostra a mecânica. A decisão depende do seu caso.</h3>
      <p class="body-text mt-3 max-2xl">Envie o cenário que você montou e a gente avalia o encaixe no seu fluxo de caixa, na sua alocação e no seu horizonte — com os custos que este modelo simplifica. Aqui, consórcio é parte da sua estratégia patrimonial, não um produto isolado.</p>
      ${S.erroAnalise ? '<p class="erro mt-3" role="alert">Não foi possível enviar agora. Tente de novo em instantes ou fale com a gente pelo WhatsApp.</p>' : ''}
      <div class="cta-botoes">
        <button type="button" class="btn btn--light" data-acao="analise" ${S.enviando ? 'disabled' : ''}>${S.enviando ? 'Enviando...' : 'Enviar meu cenário para análise'}</button>
        <a class="btn btn--accent" data-whatsapp href="#" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>
      </div>`;
  }

  function htmlResultado() {
    const r = S.resultado;
    const nome = primeiroNome();
    const idxCarta = M.CARTAS.findIndex((c) => c.min === r.carta);
    const idxIncc = M.INCCS.findIndex((o) => o.value === M.INCC_PADRAO);
    const idxLoc = M.LOCACOES.findIndex((o) => o.value === M.LOC_CURTA);

    const metrica = (rotulo, chave, id) => `<div class="metric"><span ${id ? `data-label="${id}"` : ''}>${rotulo}</span><strong data-out="${chave}">—</strong></div>`;

    return `
      <div class="stack">
        <section class="card--dark">
          <div class="eyebrow">A sua leitura</div>
          <h2 class="result-title" tabindex="-1">${nome ? `${esc(nome)}, ` : ''}é assim que essa estrutura se comporta no seu caso</h2>
          <div class="leitura mt-6">${r.leitura.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
          <div class="ressalvas">
            <div class="eyebrow">O que este número não é</div>
            <ul class="mt-3">${r.ressalvas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
          </div>
        </section>

        <section class="card card--md">
          <div class="eyebrow">Agora é com você</div>
          <h3 class="h3 mt-2">O simulador está liberado. Mexa nas premissas e veja o que muda.</h3>
          <p class="nota mt-2 max-2xl">A leitura acima usa o mês ${M.MES_REF} como referência porque é um marco redondo, não porque a contemplação vá acontecer nele. Arraste o mês e veja como as duas saídas se movem — é justamente a variável que ninguém controla.</p>
        </section>

        <section class="card card--md">
          <div class="eyebrow">Monte o seu cenário</div>
          <h3 class="h3 mt-2">Altere as variáveis e compare os dois caminhos</h3>
          <p class="nota mt-2">Tudo abaixo é premissa editável. Nada aqui é previsão de quando a contemplação acontece.</p>
          <div class="sim-controls">
            <div class="field">
              <label for="simc-carta">Valor da carta</label>
              <div class="select-wrap"><select id="simc-carta" class="input-select">${opcoesSelect(M.CARTAS, idxCarta)}</select></div>
              <div class="nota mt-2">Escala proporcional à carta-base.</div>
            </div>
            <div class="field">
              <label for="simc-mes">Mês da contemplação</label>
              <div class="mes-row">
                <span class="mes-valor" data-out="mes">${M.MES_REF}</span>
                <span class="nota">de ${M.MES_MAX}</span>
              </div>
              <input id="simc-mes" type="range" min="1" max="${M.MES_MAX}" step="1" value="${M.MES_REF}" aria-label="Mês hipotético da contemplação" />
              <div class="nota mt-1">Hipótese, não previsão.</div>
            </div>
            <div class="field">
              <label for="simc-locacao">Locação estimada</label>
              <div class="select-wrap"><select id="simc-locacao" class="input-select">${opcoesSelect(M.LOCACOES, idxLoc)}</select></div>
              <div class="nota mt-2">Receita líquida sobre o valor do imóvel.</div>
            </div>
            <div class="field">
              <label for="simc-incc">INCC anual</label>
              <div class="select-wrap"><select id="simc-incc" class="input-select">${opcoesSelect(M.INCCS, idxIncc)}</select></div>
              <div class="nota mt-2">Cenário-base do modelo: 5% a.a.</div>
            </div>
          </div>
        </section>

        <div class="saidas">
          <section class="card card--md">
            <div class="eyebrow">Saída A</div>
            <h3 class="saida-title">Cessão da carta contemplada</h3>
            <p class="nota mt-1">Liquidação estimada em 10 dias após a contemplação.</p>
            <div class="numero" data-out="a-resultado">—</div>
            <div class="nota mt-2">resultado bruto estimado no cenário-base</div>
            <div class="metricas">
              ${metrica('Crédito atualizado', 'a-credito')}
              ${metrica('Valor estimado da cessão', 'a-venda')}
              ${metrica('Total desembolsado', 'a-desemb')}
              ${metrica('Resultado sobre desembolso', 'a-retorno')}
              ${metrica('TIR mensal estimada', 'a-tir')}
            </div>
            <p class="nota mt-4">Depende da premissa de cessão a ${M.pct(M.CESSAO, 0)} do crédito atualizado. Não há garantia de comprador, de preço ou de liquidez, e a transferência depende da anuência da administradora.</p>
          </section>

          <section class="card card--md">
            <div class="eyebrow">Saída B</div>
            <h3 class="saida-title">Crédito no imóvel, avaliando a renda</h3>
            <p class="nota mt-1">Mantém o crédito integral e utiliza a carta contemplada.</p>
            <div class="numero" data-out="b-credito">—</div>
            <div class="nota mt-2">valor estimado do imóvel adquirido</div>
            <div class="metricas">
              ${metrica('Saldo estimado a pagar', 'b-saldo')}
              ${metrica('Parcela pós-contemplação', 'b-parcela', 'b-parcela')}
              ${metrica('Aluguel líquido estimado', 'b-aluguel')}
              ${metrica('Cobertura da parcela', 'b-cobertura')}
              ${metrica('Aporte ou sobra mensal', 'b-aporte')}
              ${metrica('Meses restantes', 'b-meses')}
            </div>
            <p class="nota mt-4">Aluguel é estimativa líquida sobre o valor do imóvel, bruta de tributos e sujeita a vacância. Quanto mais tarde a contemplação, menos meses restam para diluir o saldo — a parcela sobe e a cobertura cai.</p>
          </section>
        </div>

        <section class="card card--md">
          <div class="chart-head">
            <div>
              <div class="eyebrow">Leitura visual</div>
              <h3 class="saida-title">Como a cessão muda com o tempo</h3>
            </div>
            <div class="legenda">
              <span><i class="l-venda"></i>Valor estimado da cessão</span>
              <span><i class="l-desemb"></i>Capital desembolsado</span>
            </div>
          </div>
          <div class="chart" data-grafico></div>
          <p class="nota mt-3">Onde as duas linhas se cruzam, o capital já desembolsado alcança o valor estimado de cessão. Depois desse ponto, o cenário-base deixa de indicar resultado bruto positivo na venda.</p>
          <div class="premissas">
            <div class="premissa">Taxa de administração + fundo<strong>${M.pct(M.OBRIGACAO - 1, 0)} no total</strong></div>
            <div class="premissa">Parcela pré-contemplação<strong>50% da integral</strong></div>
            <div class="premissa">Cessão no secundário<strong>${M.pct(M.CESSAO, 0)} do crédito atualizado</strong></div>
            <div class="premissa">Prazo do plano-base<strong>${M.PRAZO} meses</strong></div>
          </div>
        </section>

        <section class="card--dark" data-cta>${htmlCta()}</section>
      </div>`;
  }

  // Anima a barra de progresso entre etapas (o conteúdo é substituído, a barra "continua").
  function render() {
    const barraAntiga = root.querySelector('.progress-bar');
    const larguraAntiga = barraAntiga ? barraAntiga.style.width : null;

    if (S.passo === 'contato') root.innerHTML = htmlContato();
    else if (S.passo === 'resultado') root.innerHTML = htmlResultado();
    else root.innerHTML = htmlPergunta(S.passo);

    const barra = root.querySelector('.progress-bar');
    if (barra && larguraAntiga && larguraAntiga !== barra.style.width) {
      const destino = barra.style.width;
      barra.style.width = larguraAntiga;
      void barra.offsetWidth; // força reflow
      barra.style.width = destino;
    }

    if (S.passo === 'resultado') montarSimulador();
    atualizarLinksWhatsapp(root);
  }

  /** Após trocar de etapa: mantém o card visível e move o foco para o título. */
  function focarEtapa() {
    const card = root.firstElementChild;
    if (card && card.getBoundingClientRect().top < 0) rolarAte(root);
    const titulo = root.querySelector('[tabindex="-1"]');
    if (titulo) titulo.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------
  // Simulador
  // ---------------------------------------------------------------------------
  function montarSimulador() {
    const sim = {
      carta: S.resultado.carta,
      mes: M.MES_REF,
      incc: M.INCC_PADRAO,
      locacao: M.LOC_CURTA,
    };
    let interagiu = false;
    let serieCache = { chave: '', dados: [] };

    const $ = (sel) => root.querySelector(sel);
    const out = (chave) => root.querySelector(`[data-out="${chave}"]`);
    const inCarta = $('#simc-carta');
    const inMes = $('#simc-mes');
    const inLoc = $('#simc-locacao');
    const inIncc = $('#simc-incc');

    const grafico = window.MCMGrafico.criar($('[data-grafico]'), { mesMax: M.MES_MAX, formatarMoeda: (v) => M.moeda(v) });

    function marcarInteracao() {
      if (!interagiu) { interagiu = true; track('SimcSimulatorInteract'); }
    }

    function setTexto(chave, texto, classe) {
      const node = out(chave);
      if (!node) return;
      node.textContent = texto;
      node.classList.remove('positivo', 'negativo');
      if (classe) node.classList.add(classe);
    }

    function atualizar() {
      const a = M.saidaA(sim.mes, sim.carta, sim.incc);
      const b = M.saidaB(sim.mes, sim.carta, sim.incc, sim.locacao);

      // Mês
      out('mes').textContent = sim.mes;
      inMes.style.setProperty('--fill', `${((sim.mes - 1) / (M.MES_MAX - 1)) * 100}%`);

      // Saída A
      setTexto('a-resultado', M.moeda(a.resultado), a.resultado >= 0 ? 'positivo' : 'negativo');
      setTexto('a-credito', M.moeda(a.creditoAtualizado));
      setTexto('a-venda', M.moeda(a.valorDeVenda));
      setTexto('a-desemb', M.moeda(a.desembolsado));
      setTexto('a-retorno', M.pct(a.retornoSobreDesembolso), a.retornoSobreDesembolso < 0 ? 'negativo' : null);
      setTexto('a-tir', a.tirMensal === null ? '—' : `${M.pct(a.tirMensal, 2)} a.m.`, (a.tirMensal ?? 0) < 0 ? 'negativo' : null);

      // Saída B
      setTexto('b-credito', M.moeda(b.creditoAtualizado));
      setTexto('b-saldo', M.moeda(b.saldoRemanescente));
      root.querySelector('[data-label="b-parcela"]').textContent = b.ehQuitacao
        ? `Saldo a quitar em ${b.mesesRestantes} ${b.mesesRestantes > 1 ? 'meses' : 'mês'}`
        : 'Parcela pós-contemplação';
      setTexto('b-parcela', b.ehQuitacao ? M.moeda(b.saldoRemanescente) : M.moeda(b.parcelaPos));
      setTexto('b-aluguel', M.moeda(b.aluguel));
      setTexto('b-cobertura', b.ehQuitacao ? 'n/a' : M.pct(b.cobertura, 0));
      setTexto(
        'b-aporte',
        b.ehQuitacao ? 'n/a' : b.aporteMensal >= 0 ? `${M.moeda(b.aporteMensal)} de aporte` : `${M.moeda(Math.abs(b.aporteMensal))} de sobra`,
        !b.ehQuitacao && b.aporteMensal < 0 ? 'positivo' : null
      );
      setTexto('b-meses', String(b.mesesRestantes));

      // Gráfico (a série só muda com carta/INCC)
      const chave = `${sim.carta}|${sim.incc}`;
      if (serieCache.chave !== chave) serieCache = { chave, dados: M.serie(sim.carta, sim.incc, 3) };
      grafico.atualizar(serieCache.dados, sim.mes);

      // Cenário atual (vai no pedido de análise)
      // Taxas vão como fração (0.05 = 5%), como o registro da ferramenta declara.
      const fracao = (v) => +v.toFixed(6);
      S.cenario = {
        inputs: { carta: sim.carta, mesContemplacao: sim.mes, inccAnual: sim.incc, locacaoMensal: sim.locacao },
        outputs: {
          resultadoCessao: Math.round(a.resultado),
          retornoCessao: fracao(a.retornoSobreDesembolso),
          tirMensal: a.tirMensal === null ? null : fracao(a.tirMensal),
          valorImovel: Math.round(b.creditoAtualizado),
          parcelaPos: Math.round(b.parcelaPos),
          coberturaParcela: fracao(b.cobertura),
        },
      };
    }

    inCarta.addEventListener('change', () => { marcarInteracao(); sim.carta = M.CARTAS[+inCarta.value].min; atualizar(); });
    inMes.addEventListener('input', () => { marcarInteracao(); sim.mes = +inMes.value; atualizar(); });
    inLoc.addEventListener('change', () => { marcarInteracao(); sim.locacao = M.LOCACOES[+inLoc.value].value; atualizar(); });
    inIncc.addEventListener('change', () => { marcarInteracao(); sim.incc = M.INCCS[+inIncc.value].value; atualizar(); });

    atualizar();
  }

  // ---------------------------------------------------------------------------
  // Ações
  // ---------------------------------------------------------------------------
  function responder(campo, valor) {
    if (!S.iniciou) { S.iniciou = true; track('SimcDiagnosisStarted'); }
    S.respostas[campo] = valor;
    const i = PASSOS.indexOf(campo);
    S.passo = i === PASSOS.length - 1 ? 'contato' : PASSOS[i + 1];
    if (S.passo === 'contato') track('SimcGateReached');
    render();
    focarEtapa();
  }

  function voltar(passo) {
    S.passo = passo;
    S.erros = {};
    render();
    focarEtapa();
  }

  async function enviarContato(form) {
    const erros = {};
    const nome = S.contato.nome.trim();
    if (nome.length < 3 || !nome.includes(' ')) erros.nome = 'Informe seu nome completo.';
    if (!emailValido(S.contato.email)) erros.email = 'Informe um e-mail válido.';
    const erroTel = validarTelefone(S.contato.telefone);
    if (erroTel) erros.telefone = erroTel;
    if (!S.lgpd) erros.lgpd = 'É preciso autorizar o contato para continuar.';
    S.erros = erros;

    if (Object.keys(erros).length) {
      render();
      const primeiro = root.querySelector('[aria-invalid="true"]') || root.querySelector('input[name="lgpd"]');
      if (primeiro) primeiro.focus();
      return;
    }

    // O campo invisível vai como veio: quem decide se é robô é o servidor.
    S.honeypot = form.querySelector('input[name="empresa"]').value;
    S.enviando = true;
    render();

    S.resultado = M.leitura(S.respostas);
    const r = S.respostas;
    const envio = enviarEtapa(
      'diagnostico',
      { carta: S.resultado.carta, aporte: r.aporte, objetivo: r.objetivo, patrimonio: r.patrimonio },
      {
        cabimento: S.resultado.cabimento,
        destaque: S.resultado.destaque,
        parcelaInicial: S.resultado.parcelaInicial,
        mesCessaoZera: S.resultado.mesEmQueACessaoZera,
      }
    );

    // O evento de conversão só existe depois de o core confirmar o lead, e uma vez só.
    envio.then((res) => {
      if (res.ok && !res.duplicado) {
        track('lead_submit', {
          form_id: 'simc-op',
          patrimonio_faixa: r.patrimonio || '',
          consorcio_objetivo_saida: r.objetivo || '',
        });
      }
    });

    // Não segura a pessoa: se o core demorar, o resultado aparece e o envio segue em segundo plano.
    const resposta = await Promise.race([envio, sleep(4000).then(() => null)]);
    S.enviando = false;

    // O core recusou os dados: mostrar o resultado agora perderia o lead em silêncio.
    if (resposta && resposta.recusado) {
      S.erros = { geral: 'Não conseguimos registrar seus dados. Confira o e-mail e o WhatsApp e tente de novo.' };
      render();
      return;
    }

    S.passo = 'resultado';
    track('SimcVerdictShown', { simc_destaque: S.resultado.destaque, simc_cabimento: S.resultado.cabimento });
    render();
    focarEtapa();
  }

  async function pedirAnalise() {
    const cta = root.querySelector('[data-cta]');
    const redesenhar = () => { cta.innerHTML = htmlCta(); atualizarLinksWhatsapp(cta); };

    S.enviando = true;
    S.erroAnalise = false;
    redesenhar();

    const res = S.cenario
      ? await enviarEtapa('cenario', S.cenario.inputs, S.cenario.outputs)
      : { ok: false };

    S.enviando = false;
    // "Recebido" só aparece se o core confirmou: dizer isso sem confirmação deixaria a pessoa esperando um retorno que não vem.
    if (res.ok) {
      S.analisePedida = true;
      if (!res.duplicado) track('SimcAnalysisRequested');
    } else {
      S.erroAnalise = true;
    }
    redesenhar();
  }

  // ---------------------------------------------------------------------------
  // Eventos (delegação)
  // ---------------------------------------------------------------------------
  root.addEventListener('click', (e) => {
    const opcao = e.target.closest('[data-campo]');
    if (opcao) return responder(opcao.dataset.campo, opcao.dataset.valor);

    const voltarBtn = e.target.closest('[data-voltar]');
    if (voltarBtn) return voltar(voltarBtn.dataset.voltar);

    const analise = e.target.closest('[data-acao="analise"]');
    if (analise && !S.enviando) return pedirAnalise();

    const wa = e.target.closest('[data-whatsapp]');
    if (wa) track('SimcWhatsAppClick');
  });

  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.name === 'firstname') S.contato.nome = t.value;
    else if (t.name === 'email') S.contato.email = t.value;
    else if (t.name === 'phone') { t.value = mascararTelefone(t.value); S.contato.telefone = t.value; }
  });

  root.addEventListener('change', (e) => {
    if (e.target.name === 'lgpd') S.lgpd = e.target.checked;
  });

  root.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form="contato"]');
    if (!form) return;
    e.preventDefault();
    if (!S.enviando) enviarContato(form);
  });

  // Abandono: saiu da página depois de começar e antes do resultado.
  window.addEventListener('pagehide', () => {
    if (S.iniciou && S.passo !== 'resultado') track('SimcDiagnosisAbandoned', { simc_step: S.passo });
  });

  // ---------------------------------------------------------------------------
  // Página
  // ---------------------------------------------------------------------------
  function linkWhatsapp() {
    if (!C.WHATSAPP_NUMERO) return null;
    return `https://wa.me/${digitos(C.WHATSAPP_NUMERO)}?text=${encodeURIComponent(C.WHATSAPP_MENSAGEM || '')}`;
  }

  function atualizarLinksWhatsapp(escopo) {
    const href = linkWhatsapp();
    escopo.querySelectorAll('[data-whatsapp]').forEach((a) => {
      if (href) a.href = href;
      else a.addEventListener('click', (ev) => { ev.preventDefault(); console.warn('[MCM] WHATSAPP_NUMERO não configurado.'); });
    });
  }

  function iniciarPagina() {
    document.querySelectorAll('[data-scroll-to]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        rolarAte(document.getElementById(a.dataset.scrollTo));
      });
    });

    document.querySelectorAll('[data-config-href]').forEach((a) => {
      const href = C[a.dataset.configHref];
      if (href) a.href = href;
    });

    const ano = document.querySelector('[data-ano]');
    if (ano) ano.textContent = new Date().getFullYear();

    atualizarLinksWhatsapp(document.querySelector('.site-footer'));
    render();
  }

  iniciarPagina();
})();
