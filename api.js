const express = require('express');
const MTProto = require('@mtproto/core');
const fs = require('fs');

const app = express();

// pega a sessão do ambiente e grava em /tmp
const sessionData = process.env.TG_SESSION;
fs.writeFileSync('/tmp/session.json', sessionData);

const mtproto = new MTProto({
  api_id: process.env.API_ID,   // variável de ambiente
  api_hash: process.env.API_HASH, // variável de ambiente
  storageOptions: {
    path: '/tmp/session.json'   // arquivo temporário dentro do container
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fila de requisições
let fila = [];
let processando = false;

// Função que processa uma requisição da fila
async function processarFila() {
  if (processando || fila.length === 0) return;
  processando = true;

  const { valor, res } = fila.shift();

  try {
    console.log('Processando depósito de:', valor);

    const resolve = await mtproto.call('contacts.resolveUsername', {
      username: 'AVGBankBot'
    });

    const BOT_ID = resolve.users[0].id;
    const BOT_HASH = resolve.users[0].access_hash;

    // Envia /start
    await mtproto.call('messages.sendMessage', {
      peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
      message: '/start',
      random_id: Math.floor(Math.random() * 1e15)
    });

    await sleep(3000);

    // Busca histórico e encontra botão Depositar
    const history = await mtproto.call('messages.getHistory', {
      peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
      limit: 5
    });

    let msgComBotao;
    let button;
    for (const m of history.messages) {
      if (m.reply_markup) {
        const row = m.reply_markup.rows.find(r =>
          r.buttons.some(b => b.text.includes('Depositar'))
        );
        if (row) {
          msgComBotao = m;
          button = row.buttons.find(b => b.text.includes('Depositar'));
          break;
        }
      }
    }

    if (!button) {
      res.json({ erro: 'Botão não encontrado' });
      processando = false;
      processarFila();
      return;
    }

    // Clica no botão e tenta capturar resposta rápida
    let callbackAnswer;
    try {
      callbackAnswer = await mtproto.call('messages.getBotCallbackAnswer', {
        peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
        msg_id: msgComBotao.id,
        data: button.data
      });
    } catch (err) {
      console.warn('Callback não retornou resposta imediata:', err.error_message);
    }

    let toastMsg = null;
    if (callbackAnswer && callbackAnswer.message) {
      toastMsg = callbackAnswer.message;
    }

    // Se o toast indicar depósito pendente, retorna direto
    if (toastMsg && toastMsg.includes('Você já tem 1 depósito(s)')) {
      res.json({
        status: 'deposito_pendente',
        toastMsg
      });
      processando = false;
      processarFila();
      return;
    }

    await sleep(2000);

    // Pega histórico e verifica se pediu valor
    let newHistory = await mtproto.call('messages.getHistory', {
      peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
      limit: 3
    });

    let respostaBot = newHistory.messages[0];
    let textoMsg = respostaBot.message || '';
    let contemDeposito = textoMsg.includes('Digite o valor que deseja depositar');

    if (!contemDeposito) {
      res.json({
        status: 'deposito_pendente',
        toastMsg,
        texto: textoMsg
      });
      processando = false;
      processarFila();
      return;
    }

    // Se encontrou, envia o valor
    await mtproto.call('messages.sendMessage', {
      peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
      message: valor.toString(),
      random_id: Math.floor(Math.random() * 1e15)
    });

    // Espera até que a mensagem deixe de ser "Gerando código PIX..."
    let tentativa = 0;
    while (tentativa < 10) {
      await sleep(3000);
      newHistory = await mtproto.call('messages.getHistory', {
        peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
        limit: 3
      });

      respostaBot = newHistory.messages[0];
      textoMsg = respostaBot.message || '';

      if (!textoMsg.includes('Gerando código PIX')) {
        break;
      }
      tentativa++;
    }

    // Extrai o código copia e cola
    let copiaCola = null;
    const regex = /Código PIX \(Copia e Cola\)\s*([\s\S]+)/;
    const match = textoMsg.match(regex);
    if (match) {
      copiaCola = match[1].split('\n')[0].trim();
    }

    res.json({
      status: 'pix_gerado',
      texto: textoMsg,
      valorEnviado: valor,
      copiaCola,
      toastMsg,
      raw: respostaBot
    });
  } catch (err) {
    console.error('Erro ao processar fila:', err);
    res.status(500).json({ erro: err.message });
  }

  processando = false;
  processarFila();
}

app.get('/depositar', async (req, res) => {
  const valor = req.query.valor;
  if (!valor) {
    return res.json({ erro: 'Informe o valor na URL, ex: /depositar?valor=20.00' });
  }

  fila.push({ valor, res });
  console.log('Requisição adicionada à fila:', valor);

  processarFila();
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
