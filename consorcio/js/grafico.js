/**
 * Gráfico de linhas em SVG: "Como a cessão muda com o tempo".
 * Mesmo comportamento da referência (Recharts): curvas monotônicas sem animação,
 * linha tracejada no mês escolhido, tooltip ao passar o mouse/dedo.
 */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const MARGEM = { top: 8, right: 8, bottom: 28, left: 52 };

  function passoBonito(bruto) {
    const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    const norm = bruto / mag;
    const passo = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return passo * mag;
  }

  /** Curva monotônica (Fritsch–Carlson), equivalente ao curveMonotoneX. */
  function caminhoMonotono(pts) {
    const n = pts.length;
    if (n < 2) return '';
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1][0] - pts[i][0];
      m[i] = dx[i] === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx[i];
    }
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) t[i] = 0;
      else t[i] = (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
    }
    let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${(pts[i][0] + h).toFixed(2)},${(pts[i][1] + t[i] * h).toFixed(2)},` +
           `${(pts[i + 1][0] - h).toFixed(2)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(2)},` +
           `${pts[i + 1][0].toFixed(2)},${pts[i + 1][1].toFixed(2)}`;
    }
    return d;
  }

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  /**
   * @param {HTMLElement} container
   * @param {{ mesMax:number, formatarMoeda:(v:number)=>string }} opts
   */
  function criarGrafico(container, opts) {
    const mqMobile = window.matchMedia ? window.matchMedia('(max-width: 560px)') : null;
    let dados = [];
    let marcador = 1;
    let escala = null;

    const svg = el('svg', { role: 'img', 'aria-label': 'Gráfico do valor estimado da cessão e do capital desembolsado ao longo dos meses' });
    container.appendChild(svg);

    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    tooltip.setAttribute('aria-hidden', 'true');
    container.appendChild(tooltip);

    const ticksX = () => (mqMobile && mqMobile.matches ? [1, 72, 144, opts.mesMax] : [1, 36, 72, 108, 144, 180, opts.mesMax]);

    function render() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h || !dados.length) return;

      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.textContent = '';

      const iw = w - MARGEM.left - MARGEM.right;
      const ih = h - MARGEM.top - MARGEM.bottom;
      const maxBruto = Math.max(...dados.map((d) => Math.max(d.venda, d.desembolsado)));
      const passo = passoBonito(maxBruto / 4);
      const maxY = Math.ceil(maxBruto / passo) * passo;

      const x = (mes) => MARGEM.left + ((mes - 1) / (opts.mesMax - 1)) * iw;
      const y = (v) => MARGEM.top + ih - (v / maxY) * ih;
      escala = { x, y, iw, ih, w, h };

      // Grade horizontal + eixo Y
      for (let v = 0; v <= maxY + 1e-6; v += passo) {
        el('line', { class: 'grid-line', x1: MARGEM.left, x2: MARGEM.left + iw, y1: y(v), y2: y(v) }, svg);
        const t = el('text', { class: 'tick', x: MARGEM.left - 8, y: y(v), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, svg);
        t.textContent = `${Math.round(v / 1000)}k`;
      }

      // Eixo X
      el('line', { class: 'axis-line', x1: MARGEM.left, x2: MARGEM.left + iw, y1: MARGEM.top + ih, y2: MARGEM.top + ih }, svg);
      ticksX().forEach((mes) => {
        const t = el('text', { class: 'tick', x: x(mes), y: MARGEM.top + ih + 18, 'text-anchor': 'middle' }, svg);
        t.textContent = `${mes}m`;
      });

      // Linha tracejada do mês escolhido
      el('line', { class: 'marcador', x1: x(marcador), x2: x(marcador), y1: MARGEM.top, y2: MARGEM.top + ih }, svg);

      // Séries
      el('path', { class: 'linha linha-venda', d: caminhoMonotono(dados.map((d) => [x(d.mes), y(d.venda)])) }, svg);
      el('path', { class: 'linha linha-desemb', d: caminhoMonotono(dados.map((d) => [x(d.mes), y(d.desembolsado)])) }, svg);

      // Camada de hover
      const hover = el('g', { style: 'display:none' }, svg);
      const hLine = el('line', { class: 'hover-line', y1: MARGEM.top, y2: MARGEM.top + ih }, hover);
      const dVenda = el('circle', { class: 'hover-dot dot-venda', r: 5 }, hover);
      const dDesemb = el('circle', { class: 'hover-dot dot-desemb', r: 5 }, hover);
      const area = el('rect', { x: MARGEM.left, y: MARGEM.top, width: iw, height: ih, fill: 'transparent' }, svg);

      const mostrar = (clientX) => {
        const r = svg.getBoundingClientRect();
        const px = ((clientX - r.left) / r.width) * w;
        const mes = 1 + ((px - MARGEM.left) / iw) * (opts.mesMax - 1);
        let p = dados[0];
        for (const d of dados) if (Math.abs(d.mes - mes) < Math.abs(p.mes - mes)) p = d;
        const cx = x(p.mes);
        hLine.setAttribute('x1', cx); hLine.setAttribute('x2', cx);
        dVenda.setAttribute('cx', cx); dVenda.setAttribute('cy', y(p.venda));
        dDesemb.setAttribute('cx', cx); dDesemb.setAttribute('cy', y(p.desembolsado));
        hover.style.display = '';
        tooltip.innerHTML =
          `<div class="tt-mes">Mês ${p.mes}</div>` +
          `<div class="tt-row tt-venda"><span>Cessão estimada</span><strong>${opts.formatarMoeda(p.venda)}</strong></div>` +
          `<div class="tt-row tt-desemb"><span>Desembolsado</span><strong>${opts.formatarMoeda(p.desembolsado)}</strong></div>`;
        const tw = tooltip.offsetWidth;
        const left = cx + 14 + tw > w ? cx - 14 - tw : cx + 14;
        tooltip.style.transform = `translate(${Math.max(0, left)}px, ${MARGEM.top + 8}px)`;
        tooltip.classList.add('is-visible');
      };
      const esconder = () => { hover.style.display = 'none'; tooltip.classList.remove('is-visible'); };

      area.addEventListener('pointermove', (e) => mostrar(e.clientX));
      area.addEventListener('pointerdown', (e) => mostrar(e.clientX));
      area.addEventListener('pointerleave', esconder);
    }

    if (window.ResizeObserver) new ResizeObserver(render).observe(container);
    else window.addEventListener('resize', render);
    if (mqMobile && mqMobile.addEventListener) mqMobile.addEventListener('change', render);

    return {
      atualizar(novosDados, novoMarcador) {
        dados = novosDados;
        marcador = novoMarcador;
        render();
      },
    };
  }

  window.MCMGrafico = { criar: criarGrafico };
})();
