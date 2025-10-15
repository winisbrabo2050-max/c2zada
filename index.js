const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Servidor C2 ativo');
});

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
  }
});

io.on('connection', socket => {
  console.log('📡 Cliente conectado via WebSocket');

  socket.on('hora', data => {
  console.log('🕒 Horário recebido:', data);
  io.emit('hora', data); // ✅ envia para todos os clientes conectados
});

  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

