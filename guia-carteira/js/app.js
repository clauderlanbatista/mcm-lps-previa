/**
 * LP do guia "Diagnóstico de Carteira": formulário (index.html) e entrega (obrigado.html).
 * O mesmo arquivo serve às duas páginas; cada parte só age se encontrar seus elementos.
 */
(function () {
  'use strict';

  const C = window.MCM_CONFIG || {};
  const reduzMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const digitos = (s) => String(s).replace(/\D+/g, '');

  // ---------------------------------------------------------------------------
  // Eventos (dataLayer)
  // ---------------------------------------------------------------------------
  // Esta página não carrega tracker nenhum: os eventos só ficam registrados no dataLayer,
  // à espera do gerenciador de consentimento de cookies (CLAUDE.md §12.1).
  function track(evento, extra = {}) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: evento, lead_index: 'guia-carteira', page: C.LP_VERSION, landing_page_version: C.LP_VERSION, ...extra });
    } catch { /* ignora */ }
  }

  // ---------------------------------------------------------------------------
  // Envio do lead
  // ---------------------------------------------------------------------------
  /**
   * PONTO DE INTEGRAÇÃO — ainda não ligado.
   *
   * Nesta fase a LP é só front-end: os dados NÃO são gravados em lugar nenhum.
   * Para ligar ao core, como na LP de consórcio (apps/lps/consorcio/js/app.js):
   *   1. registrar o formulário em packages/shared/src/forms (contato + extra.patrimonio);
   *   2. carregar ../_shared/lead-form.js no index.html;
   *   3. trocar o corpo desta função por leadForm.enviar({ name, email, phone, honeypot, extra: { patrimonio } }).
   * O resto da página já trata o resultado no formato do lead-form ({ ok, duplicado, recusado }).
   */
  async function enviarLead(dados) {
    console.info('[MCM] Envio de lead ainda não integrado. Dados que seriam enviados:', dados);
    return { ok: true, duplicado: false, recusado: false };
  }

  // ---------------------------------------------------------------------------
  // Validação e máscara de telefone
  // ---------------------------------------------------------------------------
  const DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
  ]);

  /** Celular brasileiro: DDD válido, 9 dígitos começando por 9, e não um número de preenchimento. */
  function telefoneValido(valor) {
    let d = digitos(valor);
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    return d.length === 11 && DDDS.has(Number(d.slice(0, 2))) && d[2] === '9' && !/^(\d)\1+$/.test(d.slice(2));
  }

  function mascararTelefone(valor) {
    const d = digitos(valor).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

  // ---------------------------------------------------------------------------
  // Formulário (index.html)
  // ---------------------------------------------------------------------------
  function iniciarFormulario(form) {
    const campo = (nome) => form.elements.namedItem(nome);
    const botao = form.querySelector('button[type="submit"]');
    const textoDoBotao = botao.textContent;
    let iniciou = false;
    let enviando = false;

    // Chave do erro → campo que ele marca.
    const CAMPOS = { nome: 'firstname', email: 'email', telefone: 'phone', patrimonio: 'patrimonio', lgpd: 'lgpd' };

    function mostrarErros(erros) {
      form.querySelectorAll('[data-erro]').forEach((caixa) => {
        const mensagem = erros[caixa.dataset.erro];
        caixa.textContent = mensagem || '';
        caixa.hidden = !mensagem;
      });
      Object.entries(CAMPOS).forEach(([chave, nome]) => {
        campo(nome).setAttribute('aria-invalid', String(Boolean(erros[chave])));
      });
    }

    function validar() {
      const erros = {};
      const nome = campo('firstname').value.trim();
      if (nome.length < 3 || !nome.includes(' ')) erros.nome = 'Informe seu nome completo.';
      if (!emailValido(campo('email').value)) erros.email = 'Informe um e-mail válido.';
      if (!telefoneValido(campo('phone').value)) erros.telefone = 'Informe um WhatsApp válido com DDD.';
      if (!campo('patrimonio').value) erros.patrimonio = 'Selecione uma faixa.';
      if (!campo('lgpd').checked) erros.lgpd = 'É preciso autorizar o contato para continuar.';
      return erros;
    }

    form.addEventListener('input', (e) => {
      if (!iniciou) { iniciou = true; track('GuiaFormStarted'); }
      if (e.target.name === 'phone') e.target.value = mascararTelefone(e.target.value);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (enviando) return;

      const erros = validar();
      mostrarErros(erros);
      if (Object.keys(erros).length) {
        const primeiro = form.querySelector('[aria-invalid="true"]');
        if (primeiro) primeiro.focus();
        return;
      }

      enviando = true;
      botao.disabled = true;
      botao.textContent = 'Enviando...';

      const resultado = await enviarLead({
        name: campo('firstname').value.trim(),
        email: campo('email').value.trim(),
        phone: campo('phone').value,
        // O campo invisível vai como veio: quem decide se é robô é o servidor.
        honeypot: campo('empresa').value,
        extra: { patrimonio: campo('patrimonio').value },
      });

      if (resultado.ok) {
        // A conversão só existe depois de o envio ser confirmado, e uma vez só.
        if (!resultado.duplicado) track('lead_submit', { form_id: 'guia-carteira', patrimonio_faixa: campo('patrimonio').value });
        (C.irPara || ((url) => window.location.assign(url)))(C.PAGINA_OBRIGADO || 'obrigado.html');
        return;
      }

      enviando = false;
      botao.disabled = false;
      botao.textContent = textoDoBotao;
      mostrarErros({
        geral: resultado.recusado
          ? 'Não conseguimos registrar seus dados. Confira o e-mail e o WhatsApp e tente de novo.'
          : 'Não foi possível enviar agora. Tente de novo em instantes.',
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Entrega do guia (obrigado.html)
  // ---------------------------------------------------------------------------
  function iniciarEntrega() {
    document.querySelectorAll('[data-guia]').forEach((link) => {
      if (C.GUIA_URL) {
        link.href = C.GUIA_URL;
        if (C.GUIA_NOME_ARQUIVO) link.setAttribute('download', C.GUIA_NOME_ARQUIVO);
        link.addEventListener('click', () => track('GuiaDownloadClick'));
      } else {
        link.setAttribute('aria-disabled', 'true');
        link.addEventListener('click', (ev) => { ev.preventDefault(); console.warn('[MCM] GUIA_URL não configurado.'); });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Comum às duas páginas
  // ---------------------------------------------------------------------------
  function linkWhatsapp() {
    if (!C.WHATSAPP_NUMERO) return null;
    return `https://wa.me/${digitos(C.WHATSAPP_NUMERO)}?text=${encodeURIComponent(C.WHATSAPP_MENSAGEM || '')}`;
  }

  function iniciarPagina() {
    const whatsapp = linkWhatsapp();
    document.querySelectorAll('[data-whatsapp]').forEach((a) => {
      if (whatsapp) {
        a.href = whatsapp;
        a.addEventListener('click', () => track('GuiaWhatsAppClick'));
      } else {
        a.addEventListener('click', (ev) => { ev.preventDefault(); console.warn('[MCM] WHATSAPP_NUMERO não configurado.'); });
      }
    });

    document.querySelectorAll('[data-scroll-to]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const alvo = document.getElementById(a.dataset.scrollTo);
        if (!alvo) return;
        e.preventDefault();
        alvo.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
        const primeiroCampo = alvo.querySelector('input:not([tabindex="-1"])');
        if (primeiroCampo) primeiroCampo.focus({ preventScroll: true });
      });
    });

    document.querySelectorAll('[data-config-href]').forEach((a) => {
      const href = C[a.dataset.configHref];
      if (href) a.href = href;
    });

    const ano = document.querySelector('[data-ano]');
    if (ano) ano.textContent = new Date().getFullYear();

    const form = document.querySelector('[data-form="guia"]');
    if (form) iniciarFormulario(form);
    iniciarEntrega();
  }

  iniciarPagina();
})();
