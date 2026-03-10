// server/config/firebase.js
const admin = require('firebase-admin');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

console.log('🔥 Initializing Firebase Admin...');
console.log('📁 Project ID:', process.env.FIREBASE_PROJECT_ID);

try {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    // Strip trailing commas from JSON copy-pastes
    privateKey = privateKey.replace(/,$/, '');
    
    // Remove wrapping double quotes if they exist
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
  }
  
  // Replace literal \n with actual newlines securely
  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  
  // Create the credential object using snake_case keys as required by Firebase Admin SDK
  const credential = {
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: privateKey
  };

  // Initialize Firebase Admin
  admin.initializeApp({
    credential: admin.credential.cert(credential)
  });

    console.log('✅ Firebase Admin initialized successfully!');

    const db = admin.firestore();
    // Configure Firestore to ignore undefined properties to prevent crashes on missing fields
    db.settings({ ignoreUndefinedProperties: true });
    
    const auth = admin.auth();

  module.exports = { admin, db, auth };

} catch (error) {
  console.error('❌ Firebase Admin initialization failed:');
  console.error('Error:', error.message);
  
  // Don't exit, but provide helpful message
  console.log('\n⚠️  Continuing without Firebase - using in-memory storage');
  
  // Export mock objects for development
  module.exports = {
    admin: null,
    db: {
      collection: (colName) => ({
        doc: (docId) => ({
          get: async () => ({ exists: false, id: docId, data: () => ({}) }),
          set: async () => { console.log(`[MOCK DB] Saved to ${colName}/${docId}`); },
          update: async () => { console.log(`[MOCK DB] Updated ${colName}/${docId}`); },
          delete: async () => {}
        }),
        add: async (data) => { 
          const id = 'mock-' + Math.random().toString(36).substr(2, 9);
          console.log(`[MOCK DB] Added to ${colName} with ID: ${id}`);
          return { id }; 
        },
        where: function() { return this; },
        orderBy: function() { return this; },
        limit: function() { return this; },
        get: async () => ({ 
          docs: [],
          forEach: (fn) => []
        })
      })
    },
    auth: {
      verifyIdToken: async () => ({ uid: 'mock-uid', email: 'mock@email.com' }),
      createUser: async () => ({ uid: 'mock-uid' }),
      getUserByEmail: async () => { throw new Error('User not found'); }
    }
  };
}
