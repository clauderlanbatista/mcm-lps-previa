/**
 * Configuração da LP — único arquivo a editar para publicar.
 * Campos vazios desativam o recurso sem quebrar a página.
 */
(function () {
  // Aberta na própria máquina, a LP fala com o core local (`npm run dev`), nunca com a produção.
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  window.MCM_CONFIG = {
    // Modo de demonstração: mostra tudo, mas não envia nada a lugar nenhum. Liga sozinho quando a
    // página é aberta direto do computador (file://) ou de uma prévia no GitHub Pages (*.github.io),
    // para o cliente avaliar o layout. No endereço de verdade ele nunca liga.
    DEMONSTRACAO: window.location.protocol === 'file:' || window.location.hostname.endsWith('.github.io'),

    // API de leads do core.
    API_URL: local ? 'http://localhost:3000/api/leads' : 'https://painel.mcmpartners.com.br/api/leads',

    // Formulário e ferramenta registrados em packages/shared (forms/ e tools/).
    FORM_KEY: 'lp-consorcio',
    TOOL_VERSION: 1,

    // Versão do texto de consentimento exibido ao lado do checkbox (tabela ConsentText do core).
    // Mudou o texto do checkbox em app.js? É uma versão nova: crie-a no core antes e troque aqui.
    CONSENT_VERSION: '2026-10-v1',

    // WhatsApp no formato internacional, só dígitos (ex.: 5511999999999).
    WHATSAPP_NUMERO: '',
    WHATSAPP_MENSAGEM: 'Olá! Gostaria de saber mais sobre a simulação personalizada de consórcio da MCM.',

    // Identificação da versão da LP (vai nos eventos).
    LP_VERSION: 'mcm-consorcio-v01',

    // Prazo de retorno exibido após o pedido de análise.
    SLA_RETORNO: 'em até 1 dia útil',

    // Links institucionais.
    LINK_PRIVACIDADE: '#',
  };
})();
