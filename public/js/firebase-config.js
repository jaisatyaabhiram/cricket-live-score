// Your web app's Firebase configuration (from Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyBlqcL6StpMJkr_t1AShLuARoUYjfwjurg",
  authDomain: "cricket-score-1e8ed.firebaseapp.com",
  projectId: "cricket-score-1e8ed",
  storageBucket: "cricket-score-1e8ed.firebasestorage.app",
  messagingSenderId: "234670153922",
  appId: "1:234670153922:web:6a895bc0d70d6e191e1b5b",
  measurementId: "G-M1MQ46BCQG"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Enable offline persistence (optional)
db.enablePersistence()
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code == 'unimplemented') {
      console.log('The current browser does not support persistence.');
    }
  });