const express = require('express');
const router = express.Router();
const Match = require('../models/Match');

// Get all tournaments
router.get('/tournaments', async (req, res) => {
  try {
    const { db } = require('../config/firebase');
    const snapshot = await db.collection('tournaments').get();
    const tournaments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(tournaments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all matches
router.get('/matches', async (req, res) => {
  try {
    const matches = await Match.getAll();
    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single match
router.get('/matches/:id', async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (match) {
      res.json(match);
    } else {
      res.status(404).json({ error: 'Match not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get match scorecard
router.get('/matches/:id/scorecard', async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (match) {
      res.json({
        team1: match.team1,
        team2: match.team2,
        team1Score: match.team1Score,
        team2Score: match.team2Score,
        currentBatsmen: match.currentBatsmen,
        currentBowler: match.currentBowler,
        recentBalls: match.recentBalls
      });
    } else {
      res.status(404).json({ error: 'Match not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Add this test route to your api.js
router.get('/test-firebase', async (req, res) => {
  try {
    const { db } = require('../config/firebase');
    
    // Try to write a test document
    const testRef = db.collection('test').doc('test');
    await testRef.set({ 
      message: 'Firebase is working!', 
      timestamp: new Date().toISOString() 
    });
    
    // Try to read it back
    const doc = await testRef.get();
    
    res.json({ 
      success: true, 
      message: 'Firebase is configured correctly!',
      data: doc.data()
    });
  } catch (error) {
    res.json({ 
      success: false, 
      message: 'Firebase error',
      error: error.message 
    });
  }
});
module.exports = router;