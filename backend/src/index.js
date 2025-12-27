// backend/src/index.js - FIXED CORS VERSION
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import BotManager from './botManager.js';

// === Global error handlers ===
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = createServer(app);

// 🚀 CORS configuration dengan wildcard untuk development
const allowedOrigins = [
  "https://baby-ai.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173", // Vite dev server
  "http://127.0.0.1:3000",
  /\.vercel\.app$/, // Semua subdomain Vercel
  /\.ngrok-free\.app$/, // Semua ngrok domain
  /\.ngrok\.io$/,
  /\.ngrok-free\.dev$/
];

// 🚀 Simple CORS middleware untuk development
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  
  if (!origin) {
    return next();
  }
  
  // Check if origin is allowed
  const isAllowed = allowedOrigins.some(allowedOrigin => {
    if (typeof allowedOrigin === 'string') {
      return origin === allowedOrigin;
    } else if (allowedOrigin instanceof RegExp) {
      return allowedOrigin.test(origin);
    }
    return false;
  });
  
  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, ngrok-skip-browser-warning');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
  }
  
  next();
};

// Apply CORS middleware
app.use(corsMiddleware);

// 🚀 Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🚀 Socket.io configuration
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      const isAllowed = allowedOrigins.some(allowedOrigin => {
        if (typeof allowedOrigin === 'string') {
          return origin === allowedOrigin;
        } else if (allowedOrigin instanceof RegExp) {
          return allowedOrigin.test(origin);
        }
        return false;
      });
      
      if (isAllowed) {
        callback(null, true);
      } else {
        console.log('Socket.io CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowEIO3: true,
  serveClient: false
});

const botManager = new BotManager();

// 🚀 Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    botStatus: botManager.getBotStatus(),
    version: '1.0.0'
  });
});

// 🚀 API Routes
app.get('/api/groups', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] GET /api/groups`);
    const groups = await botManager.getGroups();
    return res.json(groups);
  } catch (error) {
    console.error('Error in /api/groups:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/groups/search', async (req, res) => {
  try {
    const { q } = req.query;
    console.log(`[${new Date().toISOString()}] GET /api/groups/search?q=${q}`);
    
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const groups = await botManager.searchGroups(q);
    return res.json(groups);
  } catch (error) {
    console.error('Error in /api/groups/search:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/groups/saved', async (req, res) => {
  try {
    const { groupIds } = req.body;
    console.log(`[${new Date().toISOString()}] POST /api/groups/saved for ${groupIds?.length || 0} groups`);
    
    if (!Array.isArray(groupIds)) {
      return res.status(400).json({ error: 'groupIds must be an array' });
    }

    const groups = await botManager.getSavedGroups(groupIds);
    return res.json(groups);
  } catch (error) {
    console.error('Error in /api/groups/saved:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/active-groups', async (req, res) => {
  try {
    const { groups } = req.body;
    console.log('Setting active groups:', groups);
    botManager.setActiveGroups(groups);
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting active groups:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/bot-status', (req, res) => {
  console.log('Checking bot status for admin bot');
  const status = botManager.getFullStatus();
  res.json(status);
});

app.post('/api/force-qr', async (req, res) => {
  try {
    console.log('Force QR via API');
    const result = await botManager.forceQRGeneration();
    res.json({ success: result });
  } catch (error) {
    console.error('Error forcing QR:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🚀 Endpoint untuk lock/unlock endpoint
app.post('/api/endpoint/lock', (req, res) => {
  try {
    const { locked } = req.body;
    const result = botManager.setEndpointLock(locked === true);
    res.json(result);
  } catch (error) {
    console.error('Error setting endpoint lock:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/endpoint/lock-status', (req, res) => {
  try {
    const status = botManager.getEndpointLockStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting endpoint lock status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🚀 Serve React app untuk production
app.use(express.static(path.join(__dirname, '../../build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../build', 'index.html'));
});

// 🚀 Socket.io events
io.on('connection', (socket) => {
  console.log('🔌 Admin client connected:', socket.id);
  
  // Add socket to bot manager
  botManager.addSocketConnection(socket);
  
  // 🚀 Send immediate status update
  socket.emit('bot-status', {
    status: botManager.getBotStatus(),
    qrCode: botManager.currentQrCode,
    fullStatus: botManager.getFullStatus()
  });
  
  socket.emit('active-groups-updated', { 
    groups: botManager.activeGroups 
  });
  
  // 🚀 Heartbeat system
  socket.on('heartbeat', (data) => {
    socket.emit('heartbeat-response', { 
      timestamp: Date.now(),
      serverTime: new Date().toISOString()
    });
  });
  
  socket.on('start-bot', async () => {
    console.log('Manual bot start requested');
    await botManager.initializeBot();
  });
  
  socket.on('stop-bot', () => {
    console.log('Manual bot stop requested');
    botManager.stopBot();
  });
  
  socket.on('force-qr', async () => {
    console.log('Force QR requested by client');
    await botManager.forceQRGeneration();
  });
  
  socket.on('retry-session', async () => {
    console.log('Session retry requested by client');
    await botManager.initializeBot();
  });
  
  socket.on('force-retry', async () => {
    console.log('Force retry connection requested by client');
    await botManager.forceQRGeneration();
  });
  
  socket.on('disconnect', (reason) => {
    console.log('🔌 Admin client disconnected:', socket.id, 'Reason:', reason);
    botManager.removeSocketConnection(socket);
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', socket.id, error);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 CORS enabled for: ${allowedOrigins.map(o => o.toString()).join(', ')}`);
});