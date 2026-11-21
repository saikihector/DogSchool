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
let alternativaSelecionada = null;
let cronometro = null;
let encerrada = false;
let enviandoResposta = false;
let tentativaConcluida = false;
let tempoEsgotado = false;
let carregamentoPendente = null;
let processandoSaida = false;

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
    if (encerrada || tempoEsgotado) return;

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
        elemento.dataset.letra = opcao.letra;
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
    if (encerrada || enviandoResposta) return;
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
                body: JSON.stringify({ idAlternativa }),
            }
        );
        if (!response.ok) {
            throw new Error(data.mensagem || 'Não foi possível registrar sua resposta.');
        }

        encerrada = true;
        tentativaConcluida = data.concluida;
        mostrarFeedback(data);
    } catch (error) {
        console.error('Erro ao registrar a resposta:', error);
        mensagemErro.textContent = error.message;
        mensagemErro.hidden = false;
        botaoConfirmar.disabled = false;
        enviandoResposta = false;
    }
}

// Mostra o acerto e o gabarito retornados após a validação do servidor.
function mostrarFeedback(resposta) {
    alternativas.forEach((alternativa) => {
        if (alternativa.dataset.letra === resposta.alternativaCorreta) {
            alternativa.classList.add('main__alternativa_certo');
        } else if (
            alternativa.dataset.idAlternativa === String(alternativaSelecionada) &&
            !resposta.correto
        ) {
            alternativa.classList.add('main__alternativa_errado');
        }
    });

    const painel = tempoEsgotado ? painelTempo : painelContinuar;
    painel.classList.remove(
        tempoEsgotado ? 'limite__tempo_div_off' : 'continuar__pausar_div_off'
    );
    painel.classList.add(
        tempoEsgotado ? 'limite__tempo_div' : 'continuar__pausar_div'
    );
    if (tentativaConcluida) {
        painel.querySelector('p').textContent = 'Avaliação concluída. Consulte seu resultado.';
        painel.querySelector('button').textContent = 'Ver resultado';
    }

    cabecalho.classList.remove('header');
    cabecalho.classList.add('header__off');
    conteudo.classList.add('desfoque');
    botaoContainer.classList.remove('main__botao');
    botaoContainer.classList.add('main__botao_off');
}

// Carrega do servidor a próxima questão ainda não respondida.
async function carregarQuestao() {
    if (!/^\d+$/.test(idTentativa || '')) {
        window.location.replace('avaliacao.html');
        return;
    }
    if (processandoSaida || carregamentoPendente) return;

    const tarefa = (async () => {
        mensagemErro.hidden = true;
        try {
            // Apenas o POST explícito inicia ou retoma a contagem no PostgreSQL.
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

            // GET consulta a questão, SEM reiniciar cronômetro no backend.
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

            encerrada = false;
            enviandoResposta = false;
            tempoEsgotado = false;
            renderizarQuestao(data);
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
    carregarQuestao();
}

// Pausa o relógio real no backend, preservando os segundos restantes.
async function pausarNoServidor() {
    if (!/^\d+$/.test(idTentativa || '')) return;
    const { response, data } = await window.apiRequest(
        `/assessments/attempts/${idTentativa}/pause`,
        { method: 'POST' }
    );
    if (!response.ok) {
        throw new Error(data.mensagem || 'Não foi possível pausar a avaliação.');
    }
}

async function sairComPausa(destino, voltarDoHistorico = false) {
    if (processandoSaida) return;
    processandoSaida = true;
    if (cronometro !== null) window.clearInterval(cronometro);
    cronometro = null;

    try {
        // Garante que um POST /resume iniciado antes do Voltar termine
        // antes do POST /pause, eliminando a corrida entre as duas chamadas.
        if (carregamentoPendente) await carregamentoPendente;
        await pausarNoServidor();
        window.location.replace(destino);
    } catch (erro) {
        console.error('Falha ao pausar a avaliação:', erro);
        mensagemErro.textContent = `${erro.message} Você ainda está na avaliação.`;
        mensagemErro.hidden = false;
        processandoSaida = false;
        // Se o Voltar foi interceptado, restaura a entrada de histórico usada para capturá-lo.
        if (voltarDoHistorico) {
            window.history.pushState({ dogsQuestao: true }, '', window.location.href);
        }
        // Recarrega o tempo real do servidor para evitar mostrar um relógio parado por engano.
        if (!encerrada) carregarQuestao();
    }
}

// O primeiro Voltar sai somente desta entrada artificial, sem descarregar a página.
// Assim podemos concluir a pausa no servidor ANTES de retornar às regras.
window.history.pushState({ dogsQuestao: true }, '', window.location.href);
window.addEventListener('popstate', () => {
    sairComPausa('avaliacao.html', true);
});

// Botão Ver progresso também grava a pausa antes de navegar.
function pausarAvaliacao() {
    sairComPausa('progresso.html');
}

// Páginas antigas restauradas pelo bfcache não devem retomar a avaliação
// sem a ação explícita do candidato em "Começar Avaliação".
window.addEventListener('pageshow', (evento) => {
    if (evento.persisted) {
        if (cronometro !== null) window.clearInterval(cronometro);
        cronometro = null;
        window.location.replace('avaliacao.html');
    }
});

// Confirma a alternativa escolhida ou tenta novamente salvar um timeout.
function confirmarResposta() {
    enviarResposta(tempoEsgotado ? null : alternativaSelecionada);
}

alternativas.forEach(configurarAlternativa);
botaoConfirmar.addEventListener('click', confirmarResposta);
document.getElementById('proxima-questao-tempo').addEventListener('click', avancarAvaliacao);
document.getElementById('proxima-questao').addEventListener('click', avancarAvaliacao);
document.getElementById('pausar-certificado-tempo').addEventListener('click', pausarAvaliacao);
document.getElementById('pausar-certificado').addEventListener('click', pausarAvaliacao);

carregarQuestao();
