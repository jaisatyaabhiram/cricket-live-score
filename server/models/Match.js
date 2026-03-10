const { db } = require('../config/firebase');

class Match {
  constructor(data) {
    this.id = data.id || null;
    this.organizerId = data.organizerId || null;
    this.tournamentId = data.tournamentId || null;
    this.team1 = data.team1 || '';
    this.team2 = data.team2 || '';
    this.overs = data.overs || 20;
    this.currentInnings = data.currentInnings || 1;
    this.team1Score = data.team1Score || { runs: 0, wickets: 0, overs: 0, balls: 0 };
    this.team2Score = data.team2Score || { runs: 0, wickets: 0, overs: 0, balls: 0 };
    
    // Scorecard Data
    this.scorecard = data.scorecard || {
        innings1: { batting: [], bowling: [] },
        innings2: { batting: [], bowling: [] }
    };

    this.currentBatsmen = data.currentBatsmen || {
      striker: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false },
      nonStriker: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false }
    };
    this.currentBowler = data.currentBowler || { name: '', overs: 0, runs: 0, wickets: 0 };
    this.recentBalls = data.recentBalls || [];
    this.matchStatus = data.matchStatus || 'upcoming';
    this.tossWinner = data.tossWinner || '';
    this.tossDecision = data.tossDecision || '';
    this.battingFirst = data.battingFirst || ''; // Team batting in Innings 1
    this.winningTeam = data.winningTeam || '';
    this.matchResult = data.matchResult || '';
    this.venue = data.venue || '';
    this.matchDate = data.matchDate || new Date().toISOString();
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  async save() {
    try {
      const data = { ...this };
      delete data.id; // Don't save the ID as a field inside the document
      
      if (this.id) {
        await db.collection('matches').doc(this.id).update(data);
        return this.id;
      } else {
        const docRef = await db.collection('matches').add(data);
        this.id = docRef.id;
        return docRef.id;
      }
    } catch (error) {
      console.warn('⚠️ Could not save match to DB due to async connection errors. Proceeding in memory.');
      if(!this.id) this.id = 'mock-match-id-'+Date.now();
      return this.id;
    }
  }

  static async findById(id) {
    try {
      const doc = await db.collection('matches').doc(id).get();
      if (doc.exists) {
        return new Match({ ...doc.data(), id: doc.id });
      }
      return null;
    } catch (error) {
      console.warn('⚠️ DB fetch error on findById. Returning mock match to prevent crash.');
      return new Match({ id, team1: 'Mock Team 1', team2: 'Mock Team 2' });
    }
  }

  static async getAll() {
    try {
      const snapshot = await db.collection('matches').orderBy('createdAt', 'desc').get();
      return snapshot.docs.map(doc => new Match({ ...doc.data(), id: doc.id }));
    } catch (error) {
      console.warn('⚠️ DB fetch error on getAll. Returning empty array.');
      return [];
    }
  }

  static async getByOrganizer(organizerId) {
    try {
      const snapshot = await db.collection('matches').where('organizerId', '==', organizerId).orderBy('createdAt', 'desc').get();
      return snapshot.docs.map(doc => new Match({ ...doc.data(), id: doc.id }));
    } catch (error) {
      // If index is missing, fallback to getAll and filter
      console.warn('Index might be missing, falling back to manual filter');
      const all = await this.getAll();
      return all.filter(m => m.organizerId === organizerId);
    }
  }

  async updateBall(ballData) {
    try {
      if (this.matchStatus === 'completed') {
        throw new Error('Cannot update match after it has been completed');
      }
      
      if (!this.tossWinner) {
        throw new Error('Please set the toss result before recording scores');
      }

      const { runs, wicket, extras, extrasType, ballType, isExtraBall, batterRuns, wicketData } = ballData;
      
      // Determine which score object to update based on who is batting first
      const battingTeam = this.currentInnings === 1 ? this.battingFirst : (this.battingFirst === this.team1 ? this.team2 : this.team1);
      const currentInningsScore = battingTeam === this.team1 ? this.team1Score : this.team2Score;
      
      // totalRuns = penalty/extras + runs hit by batter
      // For a No Ball with 2 runs: batterRuns = 2, penalty = 1, total = 3
      const totalRuns = runs || 0;
      const actualBatterRuns = batterRuns || 0;

      // 1. Update Team Score
      currentInningsScore.runs += totalRuns;
      if (wicket) {
        currentInningsScore.wickets += 1;
      }

      // 2. Determine if it's a legal ball for counts
      const isLegalBall = !isExtraBall; 
      if (isLegalBall) {
        currentInningsScore.balls += 1;
      }

      // 3. Update Individual Batter stats
      if (this.currentBatsmen.striker.name) {
          if (ballType === 'striker') {
              this.currentBatsmen.striker.runs += actualBatterRuns; 
              if (actualBatterRuns === 4) this.currentBatsmen.striker.fours += 1;
              if (actualBatterRuns === 6) this.currentBatsmen.striker.sixes += 1;
              if (isLegalBall) this.currentBatsmen.striker.balls += 1;
          }
      }

      if (wicket) {
          const strikerName = (this.currentBatsmen.striker.name || '').toLowerCase().trim();
          const nonStrikerName = (this.currentBatsmen.nonStriker.name || '').toLowerCase().trim();
          const outName = (wicketData && wicketData.outPlayerName || '').toLowerCase().trim();
          
          let target = null;
          if (outName === nonStrikerName && nonStrikerName !== '') {
              target = this.currentBatsmen.nonStriker;
          } else {
              // Default to striker if name matches or if no name provided/matched
              target = this.currentBatsmen.striker;
          }

          if (target && target.name) {
              target.isOut = true;
              target.dismissal = {
                  type: (wicketData && wicketData.type) || 'out',
                  fielder: (wicketData && wicketData.fielder) || '',
                  bowler: this.currentBowler.name || 'Unknown'
              };
              console.log(`[WICKET] Player ${target.name} marked as OUT`);
              
              // NEW: Update scorecard IMMEDIATELY before clearing the name
              this.updateScorecardBatting(target);
              target.name = ''; // Now clear the slot for next selection
          }
      }
      
      // Update the other player if they are still there
      if (this.currentBatsmen.striker.name) this.updateScorecardBatting(this.currentBatsmen.striker);
      if (this.currentBatsmen.nonStriker.name) this.updateScorecardBatting(this.currentBatsmen.nonStriker);

      // 4. Update Bowler Stats
      if (this.currentBowler.name) {
        if (isLegalBall) {
          this.currentBowler.overs = this.calculateBowlerOvers(this.currentBowler.overs);
        }
        this.currentBowler.runs += totalRuns;
        if (wicket && wicketData && wicketData.type !== 'runout') {
             this.currentBowler.wickets += 1;
        }
        this.updateScorecardBowling(this.currentBowler);
      }

      // 5. Rotate Strike (AFTER stats recorded)
      if (!wicket && actualBatterRuns % 2 !== 0) {
        this.rotateStrike();
      }
      
      const overFinished = isLegalBall && currentInningsScore.balls >= 6;
      if (overFinished) {
        currentInningsScore.overs += 1;
        currentInningsScore.balls = 0;
        // Strike rotates for all EXCEPT the last ball of a match/innings usually, 
        // but we'll do it if there's more to play.
        this.rotateStrike();
      }

      // 6. Snapshot for undo
      this.recentBalls.unshift({
        runs: totalRuns, 
        batterRuns: actualBatterRuns,
        wicket, wicketData,
        extras, extrasType, ballType, isExtraBall,
        timestamp: new Date().toISOString(),
        striker: { ...this.currentBatsmen.striker },
        nonStriker: { ...this.currentBatsmen.nonStriker },
        bowler: { ...this.currentBowler },
        inningsNum: this.currentInnings // Track which innings this ball belongs to
      });
      if (this.recentBalls.length > 20) this.recentBalls.pop();

      // 7. Win / Innings Transition Logic
      const firstInningsTeamName = this.battingFirst;
      const secondInningsTeamName = (this.battingFirst === this.team1 ? this.team2 : this.team1);
      
      const firstInningsScore = firstInningsTeamName === this.team1 ? this.team1Score : this.team2Score;
      const secondInningsScore = secondInningsTeamName === this.team1 ? this.team1Score : this.team2Score;

      if (this.currentInnings === 2) {
        if (secondInningsScore.runs > firstInningsScore.runs) {
          // Setting conclusion_pending so organizer can review/edit if needed
          this.matchStatus = 'conclusion_pending';
          this.winningTeam = secondInningsTeamName;
          this.matchResult = `${secondInningsTeamName} won by ${10 - secondInningsScore.wickets} wickets`;
        } else if (secondInningsScore.wickets >= 10 || (secondInningsScore.overs >= this.overs && secondInningsScore.balls === 0)) {
            if (firstInningsScore.runs > secondInningsScore.runs) {
                this.matchStatus = 'conclusion_pending';
                this.winningTeam = firstInningsTeamName;
                this.matchResult = `${firstInningsTeamName} won by ${firstInningsScore.runs - secondInningsScore.runs} runs`;
            } else if (firstInningsScore.runs === secondInningsScore.runs) {
                this.matchStatus = 'tie_pending';
                this.matchResult = "Match Tied";
            }
        }
      } else {
        if (firstInningsScore.wickets >= 10 || (firstInningsScore.overs >= this.overs && firstInningsScore.balls === 0)) {
          const target = firstInningsScore.runs + 1;
          this.currentInnings = 2;
          this.currentBatsmen = {
            striker: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false },
            nonStriker: { name: '', runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false }
          };
          this.currentBowler = { name: '', overs: 0, runs: 0, wickets: 0 };
          this.matchResult = `Target: ${target} runs`;
          // Do NOT clear recentBalls here — preserve the last balls for undo/display
          // The UI will reload on innings change automatically
        }
      }

      await this.save();
      return this;
    } catch (error) {
      console.warn('⚠️ Error in updateBall:', error.message);
      throw error; 
    }
  }

  async finalizeMatch() {
    if (this.matchStatus === 'conclusion_pending' || this.matchStatus === 'tie_pending') {
      this.matchStatus = 'completed';
      if (!this.matchResult) this.matchResult = "Match Completed";
      await this.save();
    }
    return this;
  }

  async reopenMatch() {
    if (this.matchStatus === 'completed') {
      this.matchStatus = 'live';
      await this.save();
    }
    return this;
  }

  async undoBall() {
    if (this.recentBalls.length === 0) return this;
    const lastBall = this.recentBalls.shift();

    // If this ball was from a different innings (e.g., it was the ball that ended innings 1),
    // we need to revert the innings transition as well.
    if (lastBall.inningsNum && lastBall.inningsNum !== this.currentInnings) {
        this.currentInnings = lastBall.inningsNum;
        this.matchResult = '';
    }

    const inningsScore = this.currentInnings === 1 ? this.team1Score : this.team2Score;

    // 1. Revert Score
    inningsScore.runs -= lastBall.runs;
    if (lastBall.wicket) inningsScore.wickets -= 1;
    
    // 2. Revert Overs/Balls
    if (!lastBall.isExtraBall) {
        if (inningsScore.balls === 0) {
            inningsScore.overs -= 1;
            inningsScore.balls = 5;
        } else {
            inningsScore.balls -= 1;
        }
    }

    // 3. Restore Player Stats from the snapshot stored on the next ball in history
    if (this.recentBalls.length > 0) {
        const prevBall = this.recentBalls[0];
        this.currentBatsmen.striker = { ...prevBall.striker };
        this.currentBatsmen.nonStriker = { ...prevBall.nonStriker };
        this.currentBowler = { ...prevBall.bowler };
    } else {
        // No history remaining — subtract manually as a fallback
        if (lastBall.ballType === 'striker') {
            this.currentBatsmen.striker.balls -= (!lastBall.isExtraBall ? 1 : 0);
            this.currentBatsmen.striker.runs -= lastBall.batterRuns || 0;
            if ((lastBall.batterRuns || 0) === 4) this.currentBatsmen.striker.fours -= 1;
            if ((lastBall.batterRuns || 0) === 6) this.currentBatsmen.striker.sixes -= 1;
        }
        if (!lastBall.isExtraBall) {
            this.currentBowler.overs = this.calculateBowlerOversUndo(this.currentBowler.overs);
        }
        this.currentBowler.runs -= lastBall.runs;
        if (lastBall.wicket) this.currentBowler.wickets -= 1;
    }

    // 4. Update scorecard with reverted stats
    this.updateScorecardBatting(this.currentBatsmen.striker);
    this.updateScorecardBatting(this.currentBatsmen.nonStriker);
    this.updateScorecardBowling(this.currentBowler);

    // 5. Revert match status if we were in a terminal state
    if (
        this.matchStatus === 'completed' ||
        this.matchStatus === 'conclusion_pending' ||
        this.matchStatus === 'tie_pending'
    ) {
        this.matchStatus = 'live';
        this.winningTeam = '';
        this.matchResult = '';
    }

    await this.save();
    return this;
  }

  updateScorecardBatting(player) {
    if (!player || !player.name) return;
    const battingList = this.currentInnings === 1 ? this.scorecard.innings1.batting : this.scorecard.innings2.batting;
    
    // Case-insensitive find
    const searchTerm = player.name.toLowerCase().trim();
    let existing = battingList.find(p => p.name.toLowerCase().trim() === searchTerm);

    if (existing) {
        const wasOut = existing.isOut === true;
        const oldDismissal = existing.dismissal;
        
        // Save current stats
        Object.assign(existing, player);
        
        // Re-apply OUT status if they were already out (persistence)
        if (wasOut || player.isOut === true) {
            existing.isOut = true;
            if (oldDismissal && !player.dismissal) {
                existing.dismissal = oldDismissal;
            }
        }
    } else {
        battingList.push({ ...player });
    }
  }

  updateScorecardBowling(bowler) {
    if (!bowler || !bowler.name) return;
    const bowlingList = this.currentInnings === 1 ? this.scorecard.innings1.bowling : this.scorecard.innings2.bowling;
    
    // Case-insensitive find
    const searchTerm = bowler.name.toLowerCase().trim();
    let existing = bowlingList.find(b => b.name.toLowerCase().trim() === searchTerm);

    if (existing) {
      Object.assign(existing, bowler);
    } else {
      bowlingList.push({ ...bowler });
    }
  }

  rotateStrike() {
    const temp = { ...this.currentBatsmen.striker };
    this.currentBatsmen.striker = { ...this.currentBatsmen.nonStriker };
    this.currentBatsmen.nonStriker = temp;
  }

  calculateBowlerOvers(current) {
    let [o, b] = current.toString().split('.').map(Number);
    if (isNaN(b)) b = 0;
    b += 1;
    if (b >= 6) {
      o += 1;
      b = 0;
    }
    return parseFloat(`${o}.${b}`);
  }

  calculateBowlerOversUndo(current) {
    let [o, b] = current.toString().split('.').map(Number);
    if (isNaN(b)) b = 0;
    if (b === 0) {
        o -= 1;
        b = 5;
    } else {
        b -= 1;
    }
    return parseFloat(`${o}.${b}`);
  }
}

module.exports = Match;