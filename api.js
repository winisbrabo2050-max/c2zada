const express = require('express');
const MTProto = require('@mtproto/core');
const fs = require('fs');

const app = express();

// pega a sessão do ambiente e grava em /tmp
const sessionData = process.env.TG_SESSION;
fs.writeFileSync('/tmp/session.json', sessionData);

const mtproto = new MTProto({
  api_id: process.env.API_ID,      // variável de ambiente
  api_hash: process.env.API_HASH,  // variável de ambiente
  storageOptions: {
    path: '/tmp/session.json'      // sessão salva em /tmp
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let fila = [];
let processando = false;

async function processarFila() {
  if (processando || fila.length === 0) return;
  processando = true;

  const { valor, res } = fila.shift();

  try {
    console.log('Processando depósito de:', valor);

    // usa variável de ambiente para o nome do bot
    const resolve = await mtproto.call('contacts.resolveUsername', {
      username: process.env.BOT_USERNAME
    });

    const BOT_ID = resolve.users[0].id;
    const BOT_HASH = resolve.users[0].access_hash;

    // Busca última mensagem para verificar se há botão "Cancelar Depósito"
    let history = await mtproto.call('messages.getHistory', {
      peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
      limit: 1
    });

    let ultimaMsg = history.messages[0];
    let buttonCancelar;
    if (ultimaMsg.reply_markup) {
      const row = ultimaMsg.reply_markup.rows.find(r =>
        r.buttons.some(b => b.text.includes('Cancelar Depósito'))
      );
      if (row) {
        buttonCancelar = row.buttons.find(b => b.text.includes('Cancelar Depósito'));
      }
    }

    if (buttonCancelar) {
      await mtproto.call('messages.getBotCallbackAnswer', {
        peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
        msg_id: ultimaMsg.id,
        data: buttonCancelar.data
      }).catch(() => {});
      console.log('Botão Cancelar Depósito clicado');
      await sleep(2000);
    }

    // Agora envia /start
    await mtproto.call('messages.sendMessage', {
      peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
      message: '/start',
      random_id: Math.floor(Math.random() * 1e15)
    });

    await sleep(3000);

    // Busca histórico e encontra botão "Depositar"
    history = await mtproto.call('messages.getHistory', {
      peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
      limit: 5
    });

    let msgComBotaoDepositar;
    let buttonDepositar;
    for (const m of history.messages) {
      if (m.reply_markup) {
        const row = m.reply_markup.rows.find(r =>
          r.buttons.some(b => b.text.includes('Depositar'))
        );
        if (row) {
          msgComBotaoDepositar = m;
          buttonDepositar = row.buttons.find(b => b.text.includes('Depositar'));
          break;
        }
      }
    }

    if (!buttonDepositar) {
      res.json({ erro: 'Botão Depositar não encontrado. O bot pode estar em manutenção.' });
      processando = false;
      processarFila();
      return;
    }

    await mtproto.call('messages.getBotCallbackAnswer', {
      peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
      msg_id: msgComBotaoDepositar.id,
      data: buttonDepositar.data
    }).catch(() => {});
    console.log('Botão Depositar clicado');

    await sleep(3000);

    let newHistory = await mtproto.call('messages.getHistory', {
      peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
      limit: 3
    });

    let respostaBot = newHistory.messages[0];
    let textoMsg = respostaBot.message || '';
    let contemDeposito = textoMsg.includes('Digite o valor que deseja depositar');

    if (!contemDeposito) {
      res.json({
        erro: 'Fluxo inesperado: não foi solicitado o valor para depositar.',
        texto: textoMsg
      });
      processando = false;
      processarFila();
      return;
    }

    await mtproto.call('messages.sendMessage', {
      peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
      message: valor.toString(),
      random_id: Math.floor(Math.random() * 1e15)
    });

    let tentativa = 0;
    let copiaCola = null;
    while (tentativa < 10) {
      await sleep(3000);
      newHistory = await mtproto.call('messages.getHistory', {
        peer: { _: 'inputPeerUser', user_id: BOT_ID, access_hash: BOT_HASH },
        limit: 1
      });

      respostaBot = newHistory.messages[0];
      textoMsg = respostaBot.message || '';

      if (textoMsg.includes('Gerando seu PIX')) {
        tentativa++;
        continue;
      }

      if (textoMsg.includes('PIX Gerado com Sucesso') || textoMsg.includes('PIX Copia e Cola')) {
        const regex = /PIX Copia e Cola:\s*([\s\S]+)/i;
        const match = textoMsg.match(regex);
        if (match) {
          copiaCola = match[1].split('\n')[0].trim();
        }
        break;
      }

      tentativa++;
    }

    if (!copiaCola) {
      res.json({
        status: 'erro',
        erro: 'Não foi possível obter o código PIX (copia e cola).',
        texto: textoMsg,
        raw: respostaBot
      });
    } else {
      res.json({
        status: 'pix_gerado',
        texto: textoMsg,
        valorEnviado: valor,
        copiaCola,
        raw: respostaBot
      });
    }
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

// Ajuste para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});
