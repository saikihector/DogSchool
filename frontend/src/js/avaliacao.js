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
let pausaRegrasPendente = null;

// Segunda camada de proteção: entrar ou voltar à página de regras pausa
// a questão pendente no backend, mesmo que o evento Voltar da página da
// questão não tenha conseguido concluir o POST /pause.
// O endpoint GET /attempts só consulta; não cria tentativas novas.
function garantirPausaNasRegras() {
    if (pausaRegrasPendente) return pausaRegrasPendente;

    const tarefa = (async () => {
        const { response, data } = await window.apiRequest('/assessments/attempts');
        if (!response.ok) {
            throw new Error(data.mensagem || 'Não foi possível verificar sua avaliação.');
        }

        const tentativaAtiva = (data.tentativas || []).find(
            (tentativa) => tentativa.status === 'em_andamento'
        );
        if (!tentativaAtiva) return;

        const pausa = await window.apiRequest(
            `/assessments/attempts/${tentativaAtiva.id}/pause`,
            { method: 'POST' }
        );
        if (!pausa.response.ok) {
            throw new Error(pausa.data.mensagem || 'Não foi possível pausar a avaliação.');
        }
    })();

    pausaRegrasPendente = tarefa;
    // Limpa o estado quando terminar, inclusive em caso de erro.
    tarefa.then(
        () => { if (pausaRegrasPendente === tarefa) pausaRegrasPendente = null; },
        () => { if (pausaRegrasPendente === tarefa) pausaRegrasPendente = null; }
    );
    return tarefa;
}

// Cria ou retoma uma tentativa autenticada antes de abrir a questão.
async function iniciarAvaliacao() {
    botaoIniciar.disabled = true;
    mensagemInicio.hidden = true;

    try {
        // Evita corrida: uma pausa tardia da página de regras não pode
        // chegar depois que a questão for retomada.
        await garantirPausaNasRegras();

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

// pageshow também roda quando o Firefox restaura a página do cache de
// navegação (bfcache). A página só permite retomar após finalizar a pausa.
window.addEventListener('pageshow', () => {
    botaoIniciar.disabled = false;
    mensagemInicio.hidden = true;

    garantirPausaNasRegras().catch((error) => {
        console.error('Falha ao pausar ao entrar nas regras:', error);
        mensagemInicio.textContent = error.message;
        mensagemInicio.hidden = false;
    });
});
