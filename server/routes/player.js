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

// Player Profile (Public/Semi-public)
router.get('/profile/:id', async (req, res) => {
    try {
        const playerId = req.params.id;
        const playerDoc = await db.collection('users').doc(playerId).get();
        if (!playerDoc.exists) return res.status(404).send('Player not found');
        const playerData = playerDoc.data();

        // Aggregate Stats from Matches - Fetches all to support legacy matches without playerIds
        const Match = require('../models/Match');
        const matchesSnapshot = await db.collection('matches').get();
        const allMatches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const stats = {
            batting: { innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, highest: 0, notOuts: 0 },
            bowling: { innings: 0, overs: 0, runs: 0, wickets: 0, ec: 0 },
            performances: [] // Match by match breakdown
        };

        allMatches.forEach(m => {
            let found = false;
            let matchPerf = { matchId: m.id, date: m.matchDate, teams: `${m.team1} vs ${m.team2}`, batting: null, bowling: null };

            // Check Innings 1 and 2
            ['innings1', 'innings2'].forEach(innKey => {
                const innings = m.scorecard[innKey];
                
                // Helper to match player uniquely by ID first, then fallback to exact Name match (for legacy data)
                const isMatch = (p) => p.id === playerId || (!p.id && p.name && p.name.trim().toLowerCase() === playerData.name.trim().toLowerCase());

                // Batting
                const batting = (innings.batting || []).find(isMatch);
                if (batting) {
                    found = true;
                    stats.batting.innings++;
                    stats.batting.runs += (batting.runs || 0);
                    stats.batting.balls += (batting.balls || 0);
                    stats.batting.fours += (batting.fours || 0);
                    stats.batting.sixes += (batting.sixes || 0);
                    if (batting.runs > stats.batting.highest) stats.batting.highest = batting.runs;
                    if (!batting.isOut) stats.batting.notOuts++;
                    matchPerf.batting = batting;
                }

                // Bowling
                const bowling = (innings.bowling || []).find(isMatch);
                if (bowling) {
                    found = true;
                    stats.bowling.innings++;
                    stats.bowling.runs += (bowling.runs || 0);
                    stats.bowling.wickets += (bowling.wickets || 0);
                    
                    // Add overs correctly (simple sum of float overs is risky, but we'll sum balls)
                    const [o, b] = (bowling.overs || 0).toString().split('.').map(Number);
                    const totalBalls = (o * 6) + (isNaN(b) ? 0 : b);
                    stats.bowling.overs += totalBalls; 

                    matchPerf.bowling = bowling;
                }
            });

            if (found) stats.performances.push(matchPerf);
        });

        // Convert total balls back to overs format for display
        const totalBowledBalls = stats.bowling.overs;
        const finalOvers = Math.floor(totalBowledBalls / 6);
        const remainingBalls = totalBowledBalls % 6;
        stats.bowling.oversStr = `${finalOvers}.${remainingBalls}`;
        
        // Calculate averages/SR/EC
        stats.batting.avg = stats.batting.innings - stats.batting.notOuts > 0 
            ? (stats.batting.runs / (stats.batting.innings - stats.batting.notOuts)).toFixed(2) 
            : stats.batting.runs;
        stats.batting.sr = stats.batting.balls > 0 ? ((stats.batting.runs / stats.batting.balls) * 100).toFixed(2) : 0;
        stats.bowling.ec = totalBowledBalls > 0 ? ((stats.bowling.runs / totalBowledBalls) * 6).toFixed(2) : 0;

        res.render('player/profile', { 
            player: playerData, 
            stats,
            user: req.session.user || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading profile');
    }
});

module.exports = router;
