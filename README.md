# 🏏 Cricket Live Score

A modern, responsive, real-time cricket scoring application built with Node.js, Express, Socket.io, and Firebase. This full-stack application allows organizers to score matches live, calculate player statistics, manage tournaments, and broadcast live scores to spectators without page refreshes.

**Live Demo:** [https://cricket-live-score-voyl.onrender.com/](https://cricket-live-score-voyl.onrender.com/)

## ✨ Key Features

- **🔴 Live Real-Time Scoring**: Spectators see live score updates instantly via WebSockets (Socket.io) without needing to refresh the page.
- **📱 Fully Responsive Premium UI**: A modern 'dark-mode glassmorphism' design that works flawlessly across desktops, tablets, and mobile devices. Includes micro-animations and match-completion fireworks!
- **📊 Comprehensive Scorecards**: Track runs, balls, boundaries (4s, 6s), strike rates, overs, maidens, wickets, and economy rates. Handles all dismissal types and extras.
- **🏆 Tournament & Squad Management**: Organizers can create tournaments, draft players into squads, and enforce team exclusivity. Includes search and filtering for fixtures.
- **👤 Player Profiles & Statistics**: Persistent career statistics for players across matches, efficiently querying past matches to display aggregate numbers.
- **🔐 Role-Based Access Control**: Different dashboards for **Organizers** (create matches, score live matches, manage tournaments) and **Players** (view their stats, join teams).

## 🛠️ Tech Stack

- **Frontend**: HTML5, Vanilla CSS (Premium Dark Theme), EJS (Embedded JavaScript Templating), Socket.io-client
- **Backend**: Node.js, Express.js, Socket.io (Real-time updates)
- **Database**: Firebase Admin SDK (Firestore NoSQL Database)
- **Authentication**: Firebase Authentication

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Firebase Project with Firestore and Authentication enabled.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jaisatyaabhiram/cricket-live-score.git
   cd cricket-live-score
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Firebase & Environment Variables:**
   - Create a `.env` file in the root directory.
   - Obtain your Firebase Service Account JSON and set the path or credentials in your `.env`.
   - Provide your Firebase client config for the frontend UI.
   
   Example `.env`:
   ```env
   PORT=3000
   FIREBASE_SERVICE_ACCOUNT_PATH=./path-to-service-account.json
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```

5. **Open in Browser:**
   Visit `http://localhost:3000`

## 🤝 Contribution
Feel free to open issues or submit pull requests if you want to improve the application!

## 📄 License
This project is licensed under the MIT License.
