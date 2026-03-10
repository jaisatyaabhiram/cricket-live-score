const express = require('express');
const router = express.Router();
const { auth, db } = require('../config/firebase');

// Login page view
router.get('/login', (req, res) => {
  res.render('auth/login', { 
    title: 'Login / Register',
    error: req.query.error,
    user: req.session.user || null
  });
});

// Auth Verification Endpoint (used by client-side JS after Firebase auth)
router.post('/verify', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Check if user exists in custom users collection
    let userDoc;
    let role = 'organizer'; // Default to organizer so they can test features
    
    try {
        if (db) {
            userDoc = await db.collection('users').doc(decodedToken.uid).get();
            if (userDoc && userDoc.exists) {
                role = userDoc.data().role || 'organizer';
            }
        }
    } catch (dbError) {
        console.warn('⚠️ Could not fetch user role from DB. Defaulting to Admin/Organizer.');
    }

    // Set session
    req.session.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: role
    };
    
    res.json({ success: true, role: role });
  } catch (error) {
    console.error('Login verification error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// Registration Endpoint (saves user role)
router.post('/register', async (req, res) => {
  try {
    const { idToken, role, name } = req.body;
    
    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    
    try {
        if (db) {
            // Save user profile to Firestore
            await db.collection('users').doc(decodedToken.uid).set({
                email: decodedToken.email,
                name: name,
                role: role // 'organizer' or 'player'
            });
        }
    } catch (dbError) {
        console.warn('⚠️ Could not save user profile to DB. Session will still be created.');
    }

    // Set session
    req.session.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: name,
      role: role
    };
    
    res.json({ success: true, role: role });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(401).json({ error: 'Registration failed' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;


