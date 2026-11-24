const header = document.getElementById('header');
const hamburger = document.getElementById('hamburger');
const nav = document.getElementById('nav');

// Abre/fecha o menu no celular.
hamburger.addEventListener('click', () => {
    const aberto = nav.classList.toggle('open');
    hamburger.classList.toggle('open', aberto);
    hamburger.setAttribute('aria-expanded', aberto);
});

// Header ganha fundo ao rolar a página.
window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
});

const botaoIniciar = document.getElementById('iniciar-avaliacao');
const mensagemInicio = document.getElementById('mensagem-inicio');
// A página de regras não altera o cronômetro nem o resultado da tentativa.
// A página de questão é responsável por registrar saídas e recuperar falhas.

// Cria ou retoma uma tentativa autenticada antes de abrir a questão.
async function iniciarAvaliacao() {
    botaoIniciar.disabled = true;
    mensagemInicio.hidden = true;

    try {
        const { response, data } = await window.apiRequest('/assessments/attempts', {
            method: 'POST',
        });
        if (!response.ok) {
            throw new Error(data.mensagem || 'Não foi possível iniciar a avaliação.');
        }

        window.location.href = `questao.html?attemptId=${data.idTentativa}`;
    } catch (error) {
        console.error('Erro ao iniciar/retomar a avaliação:', error);
        mensagemInicio.textContent = error.message;
        mensagemInicio.hidden = false;
        botaoIniciar.disabled = false;
    }
}

botaoIniciar.addEventListener('click', iniciarAvaliacao);

// Ao restaurar as regras pelo cache, não emite /pause automaticamente.
window.addEventListener('pageshow', () => {
    botaoIniciar.disabled = false;
    mensagemInicio.hidden = true;
});
