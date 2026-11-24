const botaoContainer = document.getElementById('btn-confirma');
const botaoConfirmar = botaoContainer.querySelector('button');
const painelContinuar = document.getElementById('cont-pausa');
const painelTempo = document.getElementById('limite-tempo');
const cabecalho = document.getElementById('header');
const conteudo = document.getElementById('main');
const tempoSpan = document.getElementById('tempo');
const numeroTema = document.getElementById('tema');
const textoQuestao = document.getElementById('questao-texto');
const imagemQuestao = document.querySelector('.main__questao_img');
const mensagemErro = document.getElementById('erro-avaliacao');
const alternativas = ['a', 'b', 'c', 'd'].map((letra) =>
    document.getElementById(`alternativa-${letra}`)
);

const idTentativa = new URLSearchParams(window.location.search).get('attemptId');
const TEMPO_TOTAL = 150;
const TEMPO_EXIBICAO_GABARITO = 5000; // 5 segundos mostrando a resposta correta na tela

let alternativaSelecionada = null;
let cronometro = null;
let timerFeedback = null;
// Só considera uma questão aberta depois que ela foi carregada com sucesso.
let encerrada = true;
let enviandoResposta = false;
let tentativaConcluida = false;
let tempoEsgotado = false;
let carregamentoPendente = null;
let processandoSaida = false;
let idProgressoAtual = null;

// Habilita seleção por mouse e teclado nas alternativas exibidas na questão.
function configurarAlternativa(alternativa) {
    alternativa.setAttribute('role', 'radio');
    alternativa.setAttribute('aria-checked', 'false');
    alternativa.setAttribute('tabindex', '0');
    alternativa.addEventListener('click', selecionarAlternativa);
    alternativa.addEventListener('keydown', selecionarAlternativaTeclado);
}

// Atualiza a alternativa selecionada e habilita o botão de confirmação.
function selecionarAlternativa(evento) {
    if (encerrada || tempoEsgotado || enviandoResposta || !idProgressoAtual) return;

    alternativas.forEach((alternativa) => {
        alternativa.classList.remove('main__alternativa_selecionada');
        alternativa.setAttribute('aria-checked', 'false');
    });

    const alternativa = evento.currentTarget;
    alternativaSelecionada = Number(alternativa.dataset.idAlternativa);
    alternativa.classList.add('main__alternativa_selecionada');
    alternativa.setAttribute('aria-checked', 'true');
    botaoConfirmar.disabled = false;
    botaoContainer.classList.remove('main__botao_off');
    botaoContainer.classList.add('main__botao');
}

// Permite selecionar uma alternativa com Enter ou barra de espaço.
function selecionarAlternativaTeclado(evento) {
    if (evento.key !== 'Enter' && evento.key !== ' ') return;
    evento.preventDefault();
    selecionarAlternativa(evento);
}

// Atualiza o enunciado, tema e opções com os dados enviados pelo backend.
function renderizarQuestao(dados) {
    const questao = dados.questao;
    numeroTema.textContent = dados.numeroQuestao;
    textoQuestao.textContent = questao.enunciado;
    alternativaSelecionada = null;
    botaoConfirmar.disabled = true;

    if (questao.imagemUrl) {
        imagemQuestao.src = questao.imagemUrl;
        imagemQuestao.alt = questao.enunciado;
        imagemQuestao.hidden = false;
    } else {
        imagemQuestao.hidden = true;
    }

    questao.alternativas.forEach((opcao, indice) => {
        const elemento = alternativas[indice];
        elemento.dataset.idAlternativa = opcao.id;
        elemento.dataset.letra = String(opcao.letra || '').trim().toUpperCase();
        elemento.querySelector('.main__alternativa').textContent = opcao.letra;
        elemento.querySelector('.main__alternativa_texto').textContent = opcao.texto;
        elemento.classList.remove(
            'main__alternativa_selecionada',
            'main__alternativa_certo',
            'main__alternativa_errado'
        );
        elemento.setAttribute('aria-checked', 'false');
    });
}

// Inicia o cronômetro com o tempo restante calculado pelo servidor.
function iniciarCronometro(segundos) {
    if (cronometro !== null) window.clearInterval(cronometro);
    cronometro = null;
    let restante = Math.max(0, Math.min(TEMPO_TOTAL, segundos));
    tempoSpan.textContent = `${restante}s`;
    if (restante === 0) {
        tempoEsgotado = true;
        enviarResposta(null);
        return;
    }

    cronometro = window.setInterval(atualizarCronometro, 1000);

    // Atualiza o contador e registra timeout ao chegar a zero.
    function atualizarCronometro() {
        restante -= 1;
        tempoSpan.textContent = `${Math.max(0, restante)}s`;

        if (restante <= 0) {
            window.clearInterval(cronometro);
            tempoEsgotado = true;
            enviarResposta(null);
        }
    }
}

// Envia a resposta selecionada; o servidor verifica a alternativa e o tempo.
async function enviarResposta(idAlternativa) {
    if (encerrada || enviandoResposta || !idProgressoAtual) return;
    enviandoResposta = true;
    botaoConfirmar.disabled = true;
    mensagemErro.hidden = true;

    if (cronometro) window.clearInterval(cronometro);

    try {
        const { response, data } = await window.apiRequest(
            `/assessments/attempts/${idTentativa}/answers`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idProgresso: idProgressoAtual, idAlternativa }),
                keepalive: true,
            }
        );
        if (!response.ok) {
            throw new Error(data.mensagem || 'Não foi possível registrar sua resposta.');
        }

        encerrada = true;
        tentativaConcluida = Boolean(data.concluida);
        mostrarFeedback(data);
    } catch (error) {
        console.error('Erro ao registrar a resposta:', error);
        mensagemErro.textContent = error.message;
        mensagemErro.hidden = false;
        botaoConfirmar.disabled = false;
        enviandoResposta = false;
    }
}

// Destaca a alternativa correta na tela por 5s antes de abrir o painel de decisão.
function mostrarFeedback(resposta) {
    const letraCorreta = String(
        resposta.alternativaCorreta || resposta.correta || ''
    ).trim().toUpperCase();

    let textoAlternativaCorreta = '';

    // 1. Destaca imediatamente a alternativa correta (verde) e a errada selecionada (vermelho)
    alternativas.forEach((alternativa) => {
        const letraOpcao = String(alternativa.dataset.letra || '').trim().toUpperCase();
        if (letraOpcao === letraCorreta) {
            alternativa.classList.add('main__alternativa_certo');
            const textoOpcao = alternativa.querySelector('.main__alternativa_texto')?.textContent || '';
            textoAlternativaCorreta = `${letraCorreta}) ${textoOpcao}`;
        } else if (
            alternativa.dataset.idAlternativa === String(alternativaSelecionada) &&
            !resposta.correto
        ) {
            alternativa.classList.add('main__alternativa_errado');
        }
    });

    // Oculta o botão de confirmar e mantém a tela nítida durante os 5 segundos
    botaoContainer.classList.remove('main__botao');
    botaoContainer.classList.add('main__botao_off');
    conteudo.classList.remove('desfoque');

    if (timerFeedback) window.clearTimeout(timerFeedback);

    // 2. Aguarda 5 segundos para o candidato visualizar o gabarito antes de exibir o modal
    timerFeedback = window.setTimeout(() => {
        if (processandoSaida) return;

        const painel = tempoEsgotado ? painelTempo : painelContinuar;
        painel.classList.remove(
            tempoEsgotado ? 'limite__tempo_div_off' : 'continuar__pausar_div_off'
        );
        painel.classList.add(
            tempoEsgotado ? 'limite__tempo_div' : 'continuar__pausar_div'
        );

        // Mostra apenas um título e uma mensagem, sem os parágrafos antigos.
        const titulo = painel.querySelector('.feedback-titulo');
        const mensagem = painel.querySelector(
            tempoEsgotado ? '#limite-tempo-mensagem' : '#cont-pausa-mensagem'
        );
        const orientacao = painel.querySelector('.feedback-orientacao');
        const botaoAvancar = painel.querySelector(
            tempoEsgotado ? '#proxima-questao-tempo' : '#proxima-questao'
        );

        const infoGabarito = textoAlternativaCorreta
            ? `Alternativa correta: ${textoAlternativaCorreta}`
            : letraCorreta
                ? `Alternativa correta: ${letraCorreta}`
                : 'Consulte o resultado para conferir a resposta.';

        if (tentativaConcluida) {
            titulo.textContent = 'Avaliação concluída!';
            orientacao.textContent = 'Confira seu resultado ou acesse seu progresso.';
            botaoAvancar.textContent = 'Ver resultado';
        } else {
            titulo.textContent = tempoEsgotado
                ? 'Tempo esgotado!'
                : resposta.correto
                    ? 'Você acertou!'
                    : 'Resposta incorreta.';
            orientacao.textContent = 'Avance para a próxima questão ou acompanhe seu progresso.';
            botaoAvancar.textContent = 'Próxima questão';
        }

        mensagem.textContent = infoGabarito;

        cabecalho.classList.remove('header');
        cabecalho.classList.add('header__off');
    }, TEMPO_EXIBICAO_GABARITO);
}

// Encerra apenas a questão identificada; se ela já tiver uma resposta, o
// backend ignora a solicitação. A próxima questão nunca é afetada.
function requisitarAbandono(idProgresso, keepalive = false) {
    return window.apiRequest(`/assessments/attempts/${idTentativa}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idProgresso, idAlternativa: null }),
        keepalive,
    });
}

// Na abertura de uma NOVA página, uma questão ainda ativa significa que a
// página anterior foi abandonada (inclusive quando o navegador não conseguiu
// enviar a requisição de pagehide). A verificação não acontece ao avançar
// normalmente entre questões na mesma página.
async function recuperarSaidaAnterior() {
    const consulta = await window.apiRequest(
        `/assessments/attempts/${idTentativa}/current`
    );
    if (!consulta.response.ok) {
        throw new Error(consulta.data.mensagem || 'Não foi possível verificar a avaliação.');
    }
    if (consulta.data.concluida || !consulta.data.questaoAtiva) return;

    const idAnterior = Number(consulta.data.idProgresso);
    if (!Number.isSafeInteger(idAnterior) || idAnterior <= 0) {
        throw new Error('O servidor não identificou a questão pendente.');
    }
    const encerramento = await requisitarAbandono(idAnterior);
    if (!encerramento.response.ok) {
        throw new Error(encerramento.data.mensagem || 'Não foi possível encerrar a questão anterior.');
    }
}

// Carrega a próxima questão ainda não respondida. Só a primeira execução da
// página recupera possíveis saídas anteriores; o avanço no próprio site não.
async function carregarQuestao(verificarSaidaAnterior = false) {
    if (!/^\d+$/.test(idTentativa || '')) {
        window.location.replace('avaliacao.html');
        return;
    }
    if (processandoSaida || carregamentoPendente) return;

    const tarefa = (async () => {
        mensagemErro.hidden = true;
        idProgressoAtual = null;
        encerrada = true;
        botaoConfirmar.disabled = true;
        try {
            if (verificarSaidaAnterior) {
                await recuperarSaidaAnterior();
                if (processandoSaida) return;
            }

            const retomada = await window.apiRequest(
                `/assessments/attempts/${idTentativa}/resume`,
                { method: 'POST' }
            );
            if (!retomada.response.ok) {
                throw new Error(retomada.data.mensagem || 'Não foi possível retomar a avaliação.');
            }
            if (processandoSaida) return;
            if (retomada.data.concluida) {
                window.location.replace(`resultado.html?attemptId=${idTentativa}`);
                return;
            }

            const { response, data } = await window.apiRequest(
                `/assessments/attempts/${idTentativa}/current`
            );
            if (!response.ok) {
                throw new Error(data.mensagem || 'Não foi possível carregar a questão.');
            }
            if (processandoSaida) return;
            if (data.concluida) {
                window.location.replace(`resultado.html?attemptId=${idTentativa}`);
                return;
            }
            const novoId = Number(data.idProgresso);
            if (!Number.isSafeInteger(novoId) || novoId <= 0) {
                throw new Error('O servidor não identificou a questão atual.');
            }

            renderizarQuestao(data);
            idProgressoAtual = novoId;
            enviandoResposta = false;
            tempoEsgotado = false;
            encerrada = false;
            iniciarCronometro(data.restanteSegundos);
        } catch (error) {
            if (processandoSaida) return;
            console.error('Erro ao carregar a questão:', error);
            mensagemErro.textContent = error.message;
            mensagemErro.hidden = false;
            botaoConfirmar.disabled = true;
        }
    })();
    carregamentoPendente = tarefa;
    try {
        await tarefa;
    } finally {
        if (carregamentoPendente === tarefa) carregamentoPendente = null;
    }
}

// Vai para a próxima pergunta ou para o resultado depois da confirmação final.
function avancarAvaliacao() {
    if (timerFeedback) window.clearTimeout(timerFeedback);
    if (tentativaConcluida) {
        window.location.href = `resultado.html?attemptId=${idTentativa}`;
        return;
    }
    painelContinuar.classList.add('continuar__pausar_div_off');
    painelContinuar.classList.remove('continuar__pausar_div');
    painelTempo.classList.add('limite__tempo_div_off');
    painelTempo.classList.remove('limite__tempo_div');
    cabecalho.classList.remove('header__off');
    cabecalho.classList.add('header');
    conteudo.classList.remove('desfoque');
    carregarQuestao(false);
}

// O fechamento da página é uma tentativa imediata de registrar abandono.
// Não envia nada enquanto a confirmação normal estiver em andamento, ou antes
// de a questão ter sido efetivamente carregada.
function encerrarComoIncorretaPorSaida() {
    if (encerrada || enviandoResposta || processandoSaida || !idProgressoAtual ||
        !/^\d+$/.test(idTentativa || '')) return;

    processandoSaida = true;
    if (cronometro !== null) window.clearInterval(cronometro);
    cronometro = null;
    const idSaindo = idProgressoAtual;
    requisitarAbandono(idSaindo, true).catch((error) => {
        console.error('Falha ao notificar saída. Será verificada na retomada:', error);
    });
}

window.addEventListener('pagehide', encerrarComoIncorretaPorSaida);

// O botão interno só aparece depois que a resposta já foi registrada.
// Portanto, sair por ele não penaliza a questão seguinte.
function pausarAvaliacao() {
    if (!encerrada || enviandoResposta) return;
    window.location.href = 'progresso.html';
}

// Nunca reutiliza uma página de prova antiga restaurada do cache do navegador.
window.addEventListener('pageshow', (evento) => {
    if (evento.persisted) {
        if (cronometro !== null) window.clearInterval(cronometro);
        cronometro = null;
        window.location.replace('avaliacao.html');
    }
});

// Confirma a alternativa escolhida ou registra o timeout.
function confirmarResposta() {
    enviarResposta(tempoEsgotado ? null : alternativaSelecionada);
}
alternativas.forEach(configurarAlternativa);
botaoConfirmar.addEventListener('click', confirmarResposta);
document.getElementById('proxima-questao-tempo').addEventListener('click', avancarAvaliacao);
document.getElementById('proxima-questao').addEventListener('click', avancarAvaliacao);
document.getElementById('pausar-certificado-tempo').addEventListener('click', pausarAvaliacao);
document.getElementById('pausar-certificado').addEventListener('click', pausarAvaliacao);
carregarQuestao(true);