const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

// Middleware to check if user is authenticated and is a player
const requirePlayer = async (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'player') {
    return res.redirect('/auth/login?error=Unauthorized - Player access required');
  }
  next();
};

// Player Dashboard (protected)
router.get('/dashboard', requirePlayer, async (req, res) => {
  try {
    const uid = req.session.user.uid;
    console.log(`[ROUTE] Accessing Player Dashboard for UID: ${uid}`);
    
    let joinedTournaments = [];
    let availableTournaments = [];

    try {
        if (db) {
            // Fetch Tournaments this player is in
            const joinedSnapshot = await db.collection('tournaments')
                                     .where('players', 'array-contains', uid)
                                     .get();
            joinedTournaments = joinedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Fetch Available Tournaments (those the player hasn't joined)
            const allSnapshot = await db.collection('tournaments').get();
            availableTournaments = allSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(t => !t.players || !t.players.includes(uid));
        }
    } catch (dbError) {
        console.warn('⚠️ Could not fetch tournaments from DB. Using empty lists.');
    }

    res.render('player/dashboard', { 
      joinedTournaments,
      availableTournaments,
      user: req.session.user 
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error loading player dashboard');
  }
});

// Join Tournament (protected)
router.post('/join-tournament/:id', requirePlayer, async (req, res) => {
    try {
        if (!db) return res.status(500).json({ error: 'DB not connected' });
        
        const tournamentId = req.params.id;
        const uid = req.session.user.uid;

        const tRef = db.collection('tournaments').doc(tournamentId);
        const tDoc = await tRef.get();

        if (!tDoc.exists) return res.status(404).json({ error: 'Tournament not found' });

        const data = tDoc.data();
        const players = data.players || [];

        if (!players.includes(uid)) {
            players.push(uid);
            await tRef.update({ players });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
