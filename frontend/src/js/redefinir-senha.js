// Lê o token só uma vez e o remove da barra de endereços imediatamente.
const parametros = new URLSearchParams(window.location.search);
const token = parametros.get('token');
window.history.replaceState(null, '', window.location.pathname);

const formulario = document.getElementById('resetform');
const aviso = document.getElementById('aviso-redefinicao');
if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
  aviso.textContent = 'Link inválido. Solicite um novo em Esqueci minha senha.';
  aviso.classList.add('erro');
  formulario.querySelector('button').disabled = true;
} else {
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const senha = formulario.elements.senha.value;
    const confirmacao = formulario.elements.confirmacao.value;
    if (senha !== confirmacao) {
      aviso.classList.add('erro');
      aviso.textContent = 'As senhas não coincidem.';
      return;
    }
    if (senha.length < 8 || new TextEncoder().encode(senha).length > 72) {
      aviso.classList.add('erro');
      aviso.textContent = 'Use ao menos 8 caracteres e no máximo 72 bytes.';
      return;
    }
    const botao = formulario.querySelector('button[type="submit"]');
    botao.disabled = true;
    aviso.textContent = 'Atualizando senha…';
    aviso.classList.remove('erro');
    try {
      const { response, data } = await window.apiAuth('/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senha }),
      });
      aviso.textContent = data.mensagem || 'Não foi possível atualizar a senha.';
      aviso.classList.toggle('erro', !response.ok);
      if (response.ok) {
        formulario.reset();
        formulario.querySelectorAll('input, button').forEach(elemento => { elemento.disabled = true; });
        const link = document.createElement('a');
        link.href = 'acesso.html';
        link.textContent = 'Ir para o login';
        link.className = 'link-login';
        formulario.appendChild(link);
      }
    } catch (_) {
      aviso.classList.add('erro');
      aviso.textContent = 'Erro de conexão. Tente novamente.';
    } finally {
      if (!formulario.querySelector('.link-login')) botao.disabled = false;
    }
  });
}
