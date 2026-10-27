import 'dotenv/config';
import { io } from 'socket.io-client';

const STUDENT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtdWN3ZjY2eDAwMDBhZWptbjJraDM0YzEiLCJyb2xlIjoiU1RVREVOVCIsImlhdCI6MTc5MDUzODAxOSwiZXhwIjoxNzkxMTQyODE5fQ._WQzJaF46roBvIzImItfWV0qwgJM28q46CcwKOCMKdE';

const conversationId = 'cmuk22k340000qmjm0rxj0l8f';

const socket = io('http://localhost:3000', {
  auth: {
    token: STUDENT_TOKEN,
  },
});

socket.on('connect', () => {
  console.log('✅ Socket connected');
  console.log('Socket ID:', socket.id);

  console.log('➡️ Joining conversation:', conversationId);

  socket.emit('conversation:join', conversationId);
  socket.emit('message:markRead', {
  conversationId,
  messageId: 'cmuk2szcg0002qmjm15dammt9',
});

console.log('➡️ message:markRead emitted');

  console.log('✅ conversation:join emitted');
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

socket.on('error', (error) => {
  console.error('❌ Socket error:', error);
});

socket.on('message:statusUpdate', (data) => {
  console.log('📩 message:statusUpdate:', data);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
});

