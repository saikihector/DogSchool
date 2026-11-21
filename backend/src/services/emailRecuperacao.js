// Sem dependências adicionais. Mailpit (local) ou API HTTPS do Resend (produção).
// Mailpit NÃO entrega e-mail real: ele só captura mensagens na caixa de testes.
async function enviarRecuperacao(destinatario, url) {
  const provider = (process.env.EMAIL_PROVIDER || 'mailpit').toLowerCase();
  let endpoint;
  let headers = { 'Content-Type': 'application/json' };
  let corpo;
  const assunto = 'DogSchool — redefinição de senha';
  const conteudo = `Você solicitou uma nova senha para sua conta DogSchool.\n\nUse este link nos próximos 15 minutos (uma única vez):\n${url}\n\nSe não fez essa solicitação, ignore a mensagem.`;

  if (provider === 'mailpit') {
    endpoint = 'http://mailpit:8025/api/v1/send';
    corpo = {
      From: { Email: 'nao-responda@dogschool.local', Name: 'DogSchool' },
      To: [{ Email: destinatario }],
      Subject: assunto,
      Text: conteudo,
    };
  } else if (provider === 'resend') {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
      throw new Error('RESEND_API_KEY e EMAIL_FROM precisam estar configurados.');
    }
    endpoint = 'https://api.resend.com/emails';
    headers.Authorization = `Bearer ${process.env.RESEND_API_KEY}`;
    corpo = {
      from: process.env.EMAIL_FROM,
      to: [destinatario],
      subject: assunto,
      text: conteudo,
    };
  } else {
    throw new Error('EMAIL_PROVIDER não suportado.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Serviço de e-mail respondeu HTTP ${response.status}`);
}
module.exports = { enviarRecuperacao };
