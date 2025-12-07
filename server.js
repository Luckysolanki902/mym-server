const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const { Mutex } = require('async-mutex'); // Import Mutex for queueing
const { ExpressPeerServer } = require('peer');
const handleSocketEvents = require('./utils/socketEvents');
const PairingManager = require('./utils/pairingManger');
const EnhancedPairingManager = require('./utils/EnhancedPairingManager');
const PairingLogger = require('./utils/PairingLogger');
const { getRTCConfig, getPeerServerConfig } = require('./utils/audioCall/constants');
const audioCallMetrics = require('./utils/audioCall/metrics');

const app = express();
const server = http.createServer(app);

app.use(express.json()); // Parse JSON bodies

// Enable CORS for all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));

// --- Broadcast Logic ---
const User = require('./models/User');
const { sendNotification } = require('./utils/emailService');
const { getNewConfessionBroadcastTemplate } = require('./utils/emailTemplates/newConfessionBroadcast');
const cron = require('node-cron');
const { getDailyReminderTemplate } = require('./utils/emailTemplates/dailyReminder');

// Create a Mutex to ensure broadcasts are processed sequentially
const broadcastMutex = new Mutex();

// --- Scheduled Tasks ---
// Run every day at 6:00 PM IST (12:30 PM UTC)
cron.schedule('30 12 * * *', async () => {
  console.log('[Cron] ⏰ Starting Daily 6PM Reminder Broadcast...');
  
  // Use the mutex to prevent overlapping with confession broadcasts
  broadcastMutex.runExclusive(async () => {
    try {
      const users = await User.find({ isVerified: true }).select('email').lean();
      console.log(`[Cron] 🎯 Found ${users.length} verified users for daily reminder.`);

      const { subject, text } = getDailyReminderTemplate();
      
      let sentCount = 0;
      const BATCH_SIZE = 50;

      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        const promises = batch.map(user => sendNotification({ 
            to: user.email, 
            subject, 
            text
        }));
        
        await Promise.allSettled(promises);
        sentCount += batch.length;
        console.log(`[Cron] 📨 Sent ${sentCount}/${users.length} reminders`);
        
        // Small delay to be polite to SMTP server
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log('[Cron] ✅ Daily Reminder Broadcast Complete.');
    } catch (error) {
      console.error('[Cron] ❌ Error in daily reminder:', error);
    }
  });
});

app.post('/broadcast-confession', async (req, res) => {
  const { confessionId, college, gender, confessionContent, secret } = req.body;

  // Security Check
  if (secret !== process.env.SECRET_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Send response immediately to avoid blocking the client
  res.status(200).json({ message: 'Broadcast queued successfully' });

  // Run the broadcast logic inside a Mutex lock
  // This ensures that if multiple confessions come in at once, they are processed one by one
  // preventing SMTP rate limit issues.
  broadcastMutex.runExclusive(async () => {
    try {
      console.log(`[Broadcast Server] 🚀 Starting broadcast for Confession ${confessionId}`);
      
      // Fetch all verified users
      const users = await User.find({ isVerified: true }).select('email').lean();
      console.log(`[Broadcast Server] 🎯 Found ${users.length} verified users.`);

      const { subject, text } = getNewConfessionBroadcastTemplate({
        gender,
        college,
        confessionContent,
        confessionId
      });

      let sentCount = 0;
      const BATCH_SIZE = 50; // Node.js can handle higher concurrency

      // Process in chunks
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        const promises = batch.map(user => sendNotification({ to: user.email, subject, text }));
        
        await Promise.allSettled(promises);
        sentCount += batch.length;
        console.log(`[Broadcast Server] 📨 Sent ${sentCount}/${users.length} (Confession: ${confessionId})`);
        
        // Small delay to be polite to SMTP server
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`[Broadcast Server] ✅ Broadcast Complete for Confession ${confessionId}.`);

    } catch (error) {
      console.error('[Broadcast Server] ❌ Error:', error);
    }
  });
});
// -----------------------

const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const peerServer = ExpressPeerServer(server, {
  path: '/',
  allow_discovery: true
});

app.use('/peerjs', (req, _res, next) => {
  PairingLogger.peer('PeerJS HTTP request', {
    method: req.method,
    url: req.originalUrl,
    origin: req.headers.origin,
    ip: req.ip,
  });
  next();
}, peerServer);

peerServer.on('connection', (client) => {
  const peerId = client?.getId?.() || client?.id || 'unknown';
  const token = client?.getToken?.() || client?.token;
  const remoteAddress = client?._socket?.remoteAddress || client?.socket?.remoteAddress;
  PairingLogger.peer('PeerJS client connected', {
    peerId,
    token,
    remoteAddress,
  });
});

peerServer.on('disconnect', (client) => {
  const peerId = client?.getId?.() || client?.id || 'unknown';
  PairingLogger.peer('PeerJS client disconnected', { peerId });
});

peerServer.on('error', (error) => {
  PairingLogger.error('PeerJS server error', {
    code: error?.code,
    message: error?.message,
    stack: error?.stack,
  });
});

// Create maps and queues for managing different page types
const textChatUsers = new Map();
const textChatQueue = [];
const textChatRooms = new Map();

const audioCallUsers = new Map();
const audioCallQueue = [];
const audioCallRooms = new Map();

const videoCallUsers = new Map();
const videoCallQueue = [];
const videoCallRooms = new Map();

// Create ENHANCED pairing managers for different page types
const textChatPairingManager = new EnhancedPairingManager(io, textChatUsers, textChatRooms, 'textchat');
const audioCallPairingManager = new EnhancedPairingManager(io, audioCallUsers, audioCallRooms, 'audiocall', {
  rtcConfig: getRTCConfig(),
  peerServer: getPeerServerConfig()
});
const videoCallPairingManager = new EnhancedPairingManager(io, videoCallUsers, videoCallRooms, 'videocall');

PairingLogger.pairing('All pairing managers initialized', {
  textChat: 'ready',
  audioCall: 'ready',
  videoCall: 'ready'
});

// Handle socket connections
io.on('connection', (socket) => {
  const { pageType } = socket.handshake.query;

  if (!pageType) {
    PairingLogger.error('Invalid connection attempt: missing pageType', { socketId: socket.id });
    return;
  }

  PairingLogger.socket('Socket connected', { pageType, socketId: socket.id });

  try {
    if (pageType === 'textchat') {
      handleSocketEvents(io, socket, textChatUsers, textChatQueue, textChatRooms, textChatPairingManager);
    } else if (pageType === 'audiocall') {
      handleSocketEvents(io, socket, audioCallUsers, audioCallQueue, audioCallRooms, audioCallPairingManager);
    } else if (pageType === 'videocall') {
      handleSocketEvents(io, socket, videoCallUsers, videoCallQueue, videoCallRooms, videoCallPairingManager);
    } else {
      PairingLogger.error('Invalid pageType', { pageType, socketId: socket.id });
    }
  } catch (error) {
    PairingLogger.error('Error handling socket events', error);
  }

  socket.on('disconnect', () => {
    PairingLogger.socket('Socket disconnected', { socketId: socket.id });
  });
});

// API endpoint to get user statistics
app.get('/api/user-stats', (req, res) => {
  try {
    const getUsersStats = (usersMap) => {
      let totalUsers = 0;
      let maleUsers = 0;
      let femaleUsers = 0;
      let collegeStats = {};

      for (let user of usersMap.values()) {
        totalUsers++;
        if (user.userGender === 'male') {
          maleUsers++;
        } else if (user.userGender === 'female') {
          femaleUsers++;
        }

        if (user.userCollege) {
          collegeStats[user.userCollege] = (collegeStats[user.userCollege] || 0) + 1;
        }
      }

      return { totalUsers, maleUsers, femaleUsers, collegeStats };
    };

    const textChatStats = getUsersStats(textChatUsers);
    const audioCallStats = getUsersStats(audioCallUsers);
    const videoCallStats = getUsersStats(videoCallUsers);

    res.json({
      textChatStats,
      audioCallStats,
      videoCallStats,
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching user stats: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/audiocall/stats', (req, res) => {
  try {
    res.json(audioCallMetrics.getStats());
  } catch (error) {
    PairingLogger.error('Failed to fetch audio call stats', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start the server
const serverPort = process.env.PORT || 1000;
server.listen(serverPort, () => {
  PairingLogger.pairing(`Server started on port ${serverPort}`, { 
    port: serverPort,
    timestamp: new Date().toISOString()
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  PairingLogger.error('Unhandled Promise Rejection', error);
});

// Log metrics every 30 seconds
setInterval(() => {
  PairingLogger.metrics('Server metrics', {
    textChat: textChatPairingManager.getMetrics(),
    audioCall: audioCallPairingManager.getMetrics(),
    videoCall: videoCallPairingManager.getMetrics()
  });
}, 30000);
