// server/index.js
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const session = require('express-session');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import Firebase (will work even if it fails, using mock)
const firebase = require('./config/firebase');

const organizerRoutes = require('./routes/organizer');
const authRoutes = require('./routes/auth');
const playerRoutes = require('./routes/player');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Make Firebase and io available to routes
app.use((req, res, next) => {
  req.io = io;
  req.firebase = firebase;
  next();
});

// Make Firebase config available to views
app.locals.firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Routes
app.use('/organizer', organizerRoutes);
app.use('/auth', authRoutes);
app.use('/player', playerRoutes);
app.use('/api', apiRoutes);

// Home route
app.get('/matches', (req, res) => {
  res.render('index', { 
    title: 'All Matches',
    user: req.session.user || null
  });
});

// Home route
app.get('/', (req, res) => {
  res.render('index', { 
    title: 'Live Cricket Scores',
    user: req.session.user || null
  });
});

// Public Tournament Route
app.get('/tournament/:id', async (req, res) => {
    try {
        const tournamentId = req.params.id;
        const { db } = require('./config/firebase');
        
        const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
        if (!tournamentDoc.exists) return res.status(404).send('Tournament not found');
        
        const tournament = { id: tournamentDoc.id, ...tournamentDoc.data() };
        
        const matchesSnapshot = await db.collection('matches').where('tournamentId', '==', tournamentId).get();
        const allMatches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const matches = {
            live: allMatches.filter(m => m.matchStatus === 'live'),
            upcoming: allMatches.filter(m => m.matchStatus === 'upcoming'),
            finished: allMatches.filter(m => m.matchStatus === 'finished' || m.matchStatus === 'completed')
        };

        // Fetch Squad details
        let players = [];
        if (tournament.players && tournament.players.length > 0) {
            const playersSnapshot = await db.collection('users')
                .where('__name__', 'in', tournament.players.slice(0, 30))
                .get();
            players = playersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        if (tournament.teams) {
            tournament.teams = tournament.teams.map(team => ({
                ...team,
                squadDetails: players.filter(p => team.squad && team.squad.includes(p.id))
            }));
        }

        res.render('tournament-details', {
            tournament,
            matches,
            user: req.session.user || null
        });
    } catch (err) {
        res.status(500).send('Error loading tournament');
    }
});

// Match route
app.get('/match/:id', (req, res) => {
  res.render('match', { 
    matchId: req.params.id,
    user: req.session.user || null
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('👤 New client connected');
  
  socket.on('join-match', (matchId) => {
    socket.join(`match-${matchId}`);
    console.log(`Client joined match room: ${matchId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📱 Public URL: http://localhost:${PORT}`);
  console.log(`🔐 Login URL: http://localhost:${PORT}/auth/login`);
});

