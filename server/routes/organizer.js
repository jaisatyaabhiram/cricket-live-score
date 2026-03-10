const express = require('express');
const router = express.Router();
const Match = require('../models/Match');
const { db } = require('../config/firebase');

// Middleware to check if user is authenticated and is an organizer
const requireOrganizer = async (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'organizer') {
    return res.redirect('/auth/login?error=Unauthorized - Organizer access required');
  }
  next();
};

// Dashboard (protected)
router.get('/dashboard', requireOrganizer, async (req, res) => {
  try {
    const uid = req.session.user.uid;
    
    // Fetch user's tournaments
    let tournaments = [];
    try {
        if (db) {
            const tournamentSnapshot = await db.collection('tournaments').where('organizerId', '==', uid).get();
            tournaments = tournamentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
    } catch (err) {
        console.warn('⚠️ Error fetching tournaments:', err);
    }

    // Fetch matches
    const matches = await Match.getByOrganizer(uid);
    
    res.render('organizer/dashboard', { 
      tournaments,
      matches,
      user: req.session.user 
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// Create new match (protected)
router.get('/create-match', requireOrganizer, async (req, res) => {
  const tournamentId = req.query.tournamentId || null;
  let tournaments = [];
  try {
      if (db) {
          const snapshot = await db.collection('tournaments').where('organizerId', '==', req.session.user.uid).get();
          tournaments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }
  } catch (err) {
      console.warn('⚠️ Error fetching tournaments for selection:', err);
  }
  res.render('organizer/create-match', { 
      user: req.session.user,
      selectedTournamentId: tournamentId,
      tournaments
  });
});

// Tournament Details (protected)
router.get('/tournament/:id', requireOrganizer, async (req, res) => {
    try {
        const tournamentId = req.params.id;
        
        // Fetch Tournament
        const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
        if (!tournamentDoc.exists) return res.status(404).send('Tournament not found');
        
        const tournament = { id: tournamentDoc.id, ...tournamentDoc.data() };
        if (tournament.organizerId !== req.session.user.uid) return res.status(403).send('Forbidden');

        // Fetch Matches in this tournament
        const matchesSnapshot = await db.collection('matches').where('tournamentId', '==', tournamentId).get();
        const allMatches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const matches = {
            live: allMatches.filter(m => m.matchStatus === 'live'),
            upcoming: allMatches.filter(m => m.matchStatus === 'upcoming'),
            finished: allMatches.filter(m => m.matchStatus === 'finished' || m.matchStatus === 'completed')
        };

        // Fetch Players in this tournament
        let players = [];
        if (tournament.players && tournament.players.length > 0) {
            const playersSnapshot = await db.collection('users')
                .where('__name__', 'in', tournament.players.slice(0, 30)) // Increased slice for more players
                .get();
            players = playersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // Map team squads to player objects for easy display
        if (tournament.teams) {
            tournament.teams = tournament.teams.map(team => ({
                ...team,
                squadDetails: players.filter(p => team.squad && team.squad.includes(p.id))
            }));
        }

        res.render('organizer/tournament-details', {
            tournament,
            matches,
            players,
            user: req.session.user
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading tournament details');
    }
});

// Player Search API (protected)
router.get('/players/search', requireOrganizer, async (req, res) => {
    try {
        const q = req.query.q.toLowerCase();
        // Since Firestore doesn't support full-text search, we fetch and filter (okay for small datasets)
        const snapshot = await db.collection('users').where('role', '==', 'player').get();
        const players = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
        
        res.json(players.slice(0, 5));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Player to Tournament (protected)
router.post('/tournament/:id/add-player', requireOrganizer, async (req, res) => {
    try {
        const { playerId } = req.body;
        const tournamentId = req.params.id;
        
        const tRef = db.collection('tournaments').doc(tournamentId);
        const tDoc = await tRef.get();
        if (!tDoc.exists) return res.status(404).json({ error: 'Not found' });

        const data = tDoc.data();
        const players = data.players || [];
        
        if (!players.includes(playerId)) {
            players.push(playerId);
            await tRef.update({ players });
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Team to Tournament (protected)
router.post('/tournament/:id/add-team', requireOrganizer, async (req, res) => {
    try {
        const { teamName } = req.body;
        const tournamentId = req.params.id;
        
        const tRef = db.collection('tournaments').doc(tournamentId);
        const tDoc = await tRef.get();
        if (!tDoc.exists) return res.status(404).json({ error: 'Not found' });

        const data = tDoc.data();
        const teams = data.teams || [];
        
        const newTeam = {
            id: 'team-' + Date.now(),
            name: teamName,
            squad: [] // UIDs of players in this team
        };
        
        teams.push(newTeam);
        await tRef.update({ teams });
        
        res.json({ success: true, team: newTeam });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Team Squad (protected)
router.post('/tournament/:id/team/:teamId/update-squad', requireOrganizer, async (req, res) => {
    try {
        const { playerIds } = req.body; // Array of player UIDs
        const { id: tournamentId, teamId } = req.params;
        
        const tRef = db.collection('tournaments').doc(tournamentId);
        const tDoc = await tRef.get();
        if (!tDoc.exists) return res.status(404).json({ error: 'Not found' });

        const data = tDoc.data();
        const teams = data.teams || [];
        
        const teamIndex = teams.findIndex(t => t.id === teamId);
        if (teamIndex === -1) return res.status(404).json({ error: 'Team not found' });

        teams[teamIndex].squad = playerIds;
        await tRef.update({ teams });
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Tournament GET (protected)
router.get('/create-tournament', requireOrganizer, (req, res) => {
  res.render('organizer/create-tournament', { user: req.session.user });
});

// Create Tournament POST
router.post('/create-tournament', requireOrganizer, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (db) {
       await db.collection('tournaments').add({
           name,
           description,
           organizerId: req.session.user.uid,
           players: [], 
           createdAt: new Date().toISOString()
       });
    }
    res.redirect('/organizer/dashboard');
  } catch (error) {
    console.warn('⚠️ Error creating tournament:', error);
    res.redirect('/organizer/dashboard'); 
  }
});

router.post('/create-match', requireOrganizer, async (req, res) => {
  try {
    // Inject the organizer ID so only they can update it
    const matchData = {
        ...req.body,
        organizerId: req.session.user.uid
    };
    const match = new Match(matchData);
    await match.save();
    res.redirect('/organizer/dashboard');
  } catch (error) {
    res.status(500).send('Error creating match');
  }
});

// Update match wrapper (protected)
router.get('/update-match/:id', requireOrganizer, async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    // Security check: only the creator can score it
    if (match.organizerId && match.organizerId !== req.session.user.uid) {
         return res.status(403).send('Forbidden: You did not create this match.');
    }
    
    // Fetch tournament squads if linked
    let squads = { team1: [], team2: [] };
    if (match.tournamentId) {
        const tDoc = await db.collection('tournaments').doc(match.tournamentId).get();
        if (tDoc.exists) {
            const tData = tDoc.data();
            const teams = tData.teams || [];
            
            const t1 = teams.find(t => t.name === match.team1);
            const t2 = teams.find(t => t.name === match.team2);
            
            if (t1 && t1.squad && t1.squad.length > 0) {
                const s1 = await db.collection('users').where('__name__', 'in', t1.squad).get();
                squads.team1 = s1.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            if (t2 && t2.squad && t2.squad.length > 0) {
                const s2 = await db.collection('users').where('__name__', 'in', t2.squad).get();
                squads.team2 = s2.docs.map(d => ({ id: d.id, ...d.data() }));
            }
        }
    }
    
    res.render('organizer/update-match', { 
      match,
      squads,
      user: req.session.user 
    });
  } catch (error) {
    res.status(500).send('Error loading match');
  }
});

// Update ball-by-ball (protected)
router.post('/update-ball/:id', requireOrganizer, async (req, res) => {
  try {
    console.log(`[SCORE UPDATE] Attempting to update Match ID: ${req.params.id}`);
    const match = await Match.findById(req.params.id);
    
    if (!match) {
        console.error(`[SCORE UPDATE] Match not found: ${req.params.id}`);
        return res.status(404).json({ success: false, error: 'Match not found' });
    }
    
    // Security check
    if (match.organizerId && match.organizerId !== req.session.user.uid) {
         return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updatedMatch = await match.updateBall(req.body);
    
    // Emit real-time update to all clients watching this match
    req.io.to(`match-${match.id}`).emit('match-update', updatedMatch);
    
    console.log(`[SCORE UPDATE] Successfully updated match ${match.id}`);
    res.json({ success: true, match: updatedMatch });
  } catch (error) {
    console.error('[SCORE UPDATE] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set Toss Result
router.post('/match/:id/set-toss', requireOrganizer, async (req, res) => {
    try {
        const { winner, decision } = req.body;
        const match = await Match.findById(req.params.id);
        if (!match) return res.status(404).json({ error: 'Match not found' });
        
        match.tossWinner = winner;
        match.tossDecision = decision;
        
        if (decision === 'bowl') {
            match.battingFirst = (winner === match.team1) ? match.team2 : match.team1;
        } else {
            match.battingFirst = winner;
        }
        
        match.currentInnings = 1;
        match.matchStatus = 'live';
        await match.save();
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Set Active Players
router.post('/match/:id/set-players', requireOrganizer, async (req, res) => {
    try {
        const { striker, nonStriker, bowler } = req.body;
        const match = await Match.findById(req.params.id);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        if (striker && match.currentBatsmen.striker.name !== striker) {
            match.currentBatsmen.striker = { name: striker, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false };
        }
        if (nonStriker && match.currentBatsmen.nonStriker.name !== nonStriker) {
            match.currentBatsmen.nonStriker = { name: nonStriker, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false };
        }
        if (bowler && match.currentBowler.name !== bowler) {
            match.currentBowler = { name: bowler, overs: 0, runs: 0, wickets: 0 };
        }
        
        await match.save();
        res.json({ success: true, match });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rotate Strike Manually
router.post('/match/:id/rotate-strike', requireOrganizer, async (req, res) => {
    try {
        const match = await Match.findById(req.params.id);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        match.rotateStrike();
        await match.save();
        res.json({ success: true, match });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Undo Last Ball
router.post('/match/:id/undo-ball', requireOrganizer, async (req, res) => {
    try {
        const match = await Match.findById(req.params.id);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        await match.undoBall();
        
        // Emit update to fans
        req.io.to(`match-${match.id}`).emit('match-update', match);
        
        res.json({ success: true, match });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Resolve Tie
router.post('/match/:id/resolve-tie', requireOrganizer, async (req, res) => {
    try {
        const { decision } = req.body;
        const match = await Match.findById(req.params.id);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        await match.resolveTie(decision);
        res.json({ success: true, match });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Finalize Match
router.post('/match/:id/finalize', requireOrganizer, async (req, res) => {
    try {
        const match = await Match.findById(req.params.id);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        await match.finalizeMatch();
        res.json({ success: true, match });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reopen Match (for editing if in conclusion_pending or completed)
router.post('/match/:id/reopen', requireOrganizer, async (req, res) => {
    try {
        const match = await Match.findById(req.params.id);
        if (!match) return res.status(404).json({ error: 'Match not found' });

        await match.reopenMatch();
        res.json({ success: true, match });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

