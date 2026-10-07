/**
 * Configuração da LP — único arquivo a editar para publicar.
 * Campos vazios desativam o recurso sem quebrar a página.
 */
window.MCM_CONFIG = {
  // Arquivo do guia, entregue na página de obrigado. Coloque o PDF em assets/ com este nome
  // (ou troque o caminho). Vazio = o botão de download fica desativado.
  GUIA_URL: 'assets/guia-diagnostico-de-carteira.pdf',
  // Nome com que o arquivo é salvo no computador de quem baixa.
  GUIA_NOME_ARQUIVO: 'MCM - Guia de diagnóstico de carteira.pdf',

  // Página para onde o formulário leva depois do envio.
  PAGINA_OBRIGADO: 'obrigado.html',

  // WhatsApp no formato internacional, só dígitos (ex.: 5511999999999).
  WHATSAPP_NUMERO: '',
  WHATSAPP_MENSAGEM: 'Olá! Baixei o guia de diagnóstico de carteira da MCM e gostaria de conversar sobre a minha.',

  // Identificação da versão da LP (vai nos eventos).
  LP_VERSION: 'mcm-guia-carteira-v01',

  // Links institucionais.
  LINK_PRIVACIDADE: '#',
};
