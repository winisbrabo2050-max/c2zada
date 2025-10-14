const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Rota simples para testar se o servidor está online
app.get('/', (req, res) => {
  res.send('Servidor C2 rodando...');
});

// Escuta conexões WebSocket
io.on('connection', (socket) => {
  console.log('📲 Cliente conectado');

  // Recebe horário em tempo real do app Android
  socket.on('horario', (data) => {
    console.log('🕒 Horário recebido:', data);
    // Você pode salvar, processar ou responder aqui
    socket.emit('confirmacao', 'Horário recebido com sucesso');
  });

  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado');
  });
});

server.listen(3000, () => {
  console.log('🚀 Servidor rodando na porta 3000');
});
