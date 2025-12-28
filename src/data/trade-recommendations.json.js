// Data loader for Trade Recommendations
// Generates mutually beneficial trade recommendations using power score data

const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID || "1235581944008286208";

// Configuration
const VALUE_TOLERANCE_PERCENT = 0.30;
const MIN_VALUE_THRESHOLD = 300;

/**
 * Fetch all required data
 */
async function fetchAllData() {
  const [league, rosters, users, players] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}`).then(r => r.json()),
    fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/rosters`).then(r => r.json()),
    fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/users`).then(r => r.json()),
    fetch('https://api.sleeper.app/v1/players/nfl').then(r => r.json())
  ]);

  // Fetch DynastyProcess values
  const dpValuesText = await fetch(
    "https://raw.githubusercontent.com/dynastyprocess/data/master/files/values.csv"
  ).then(r => r.text());

  const dpPlayerIdsText = await fetch(
    "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv"
  ).then(r => r.text());

  return { league, rosters, users, players, dpValuesText, dpPlayerIdsText };
}

/**
 * Parse CSV
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || '';
    });
    return obj;
  });
}

/**
 * Normalize name for matching
 */
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .trim();
}

/**
 * Detect superflex league
 */
function isSuperflexLeague(league) {
  const positions = league.roster_positions || [];
  return positions.includes('SUPER_FLEX') ||
         positions.filter(p => p === 'QB').length >= 2;
}

/**
 * Get starting slots
 */
function getStartingSlots(league) {
  const positions = league.roster_positions || [];
  const slots = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, K: 0, DEF: 0 };

  positions.forEach(pos => {
    if (pos && pos !== 'BN' && slots.hasOwnProperty(pos)) {
      slots[pos]++;
    }
  });

  return slots;
}

/**
 * Match player values
 */
function matchPlayerValues(players, dpValues, dpPlayerIds, isSF) {
  const playerValues = new Map();
  const valueColumn = isSF ? 'value_2qb' : 'value_1qb';

  const sleeperIdToRecord = new Map();
  dpPlayerIds.forEach(record => {
    if (record.sleeper_id) {
      sleeperIdToRecord.set(record.sleeper_id, record);
    }
  });

  const fpIdToValues = new Map();
  dpValues.forEach(dp => {
    if (dp.fp_id) {
      fpIdToValues.set(dp.fp_id, dp);
    }
  });

  const nameLookup = new Map();
  dpValues.forEach(dp => {
    const key = `${normalizeName(dp.player)}_${dp.pos}`;
    nameLookup.set(key, dp);
  });

  Object.entries(players).forEach(([playerId, player]) => {
    if (!player || !player.first_name) return;

    const fullName = `${player.first_name} ${player.last_name}`;
    const position = player.position;
    let dpMatch = null;

    const playerRecord = sleeperIdToRecord.get(playerId);
    if (playerRecord && playerRecord.fantasypros_id) {
      dpMatch = fpIdToValues.get(playerRecord.fantasypros_id);
    }

    if (!dpMatch) {
      const key = `${normalizeName(fullName)}_${position}`;
      dpMatch = nameLookup.get(key);
    }

    if (dpMatch) {
      const value = parseInt(dpMatch[valueColumn]) || 0;
      playerValues.set(playerId, {
        value,
        name: fullName,
        position,
        team: player.team,
        age: dpMatch.age ? parseFloat(dpMatch.age) : player.age
      });
    } else {
      playerValues.set(playerId, {
        value: position === 'K' ? 50 : position === 'DEF' ? 100 : 200,
        name: fullName,
        position,
        team: player.team,
        age: player.age
      });
    }
  });

  return playerValues;
}

/**
 * Calculate optimal lineup
 */
function calculateOptimalLineup(rosterPlayerIds, playerValues, slots, players) {
  const byPosition = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };

  rosterPlayerIds.forEach(playerId => {
    const player = players[playerId];
    if (!player) return;

    const position = player.position;
    const valueData = playerValues.get(playerId);
    const value = valueData?.value || 0;

    if (byPosition[position]) {
      byPosition[position].push({ playerId, value, name: valueData?.name || 'Unknown', position });
    }
  });

  Object.keys(byPosition).forEach(pos => {
    byPosition[pos].sort((a, b) => b.value - a.value);
  });

  const starters = [];
  const used = new Set();

  ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
    const needed = slots[pos] || 0;
    const available = byPosition[pos];

    for (let i = 0; i < needed && i < available.length; i++) {
      starters.push({ ...available[i], slot: pos });
      used.add(available[i].playerId);
    }
  });

  const flexEligible = [...byPosition.RB, ...byPosition.WR, ...byPosition.TE]
    .filter(p => !used.has(p.playerId))
    .sort((a, b) => b.value - a.value);

  for (let i = 0; i < (slots.FLEX || 0) && i < flexEligible.length; i++) {
    starters.push({ ...flexEligible[i], slot: 'FLEX' });
    used.add(flexEligible[i].playerId);
  }

  const sfEligible = [...byPosition.QB, ...byPosition.RB, ...byPosition.WR, ...byPosition.TE]
    .filter(p => !used.has(p.playerId))
    .sort((a, b) => b.value - a.value);

  for (let i = 0; i < (slots.SUPER_FLEX || 0) && i < sfEligible.length; i++) {
    starters.push({ ...sfEligible[i], slot: 'SUPER_FLEX' });
    used.add(sfEligible[i].playerId);
  }

  return { starters, starterIds: used };
}

/**
 * Build team data
 */
function buildTeamData(roster, users, playerValues, slots, players) {
  const user = users.find(u => u.user_id === roster.owner_id);
  const teamName = user?.display_name || `Team ${roster.roster_id}`;

  const rosterPlayerIds = roster.players || [];
  const lineup = calculateOptimalLineup(rosterPlayerIds, playerValues, slots, players);

  const rosterPlayers = rosterPlayerIds.map(playerId => {
    const pv = playerValues.get(playerId);
    const player = players[playerId];
    if (!pv || !player) return null;

    return {
      playerId,
      name: pv.name,
      position: pv.position,
      team: pv.team,
      value: pv.value,
      age: pv.age || player.age,
      isStarter: lineup.starterIds.has(playerId)
    };
  }).filter(p => p !== null);

  return {
    rosterId: roster.roster_id,
    teamName,
    avatar: user?.avatar,
    players: rosterPlayers,
    starters: lineup.starters
  };
}

/**
 * Analyze team needs
 */
function analyzeTeamNeeds(team, allTeams, slots) {
  const positions = ['QB', 'RB', 'WR', 'TE'];
  const analysis = {};

  positions.forEach(pos => {
    const posPlayers = team.players
      .filter(p => p.position === pos)
      .sort((a, b) => b.value - a.value);

    const requiredStarters = getRequiredStarters(pos, slots);
    const starters = posPlayers.slice(0, requiredStarters);
    const bench = posPlayers.slice(requiredStarters);

    // Calculate league average
    let leagueTotal = 0, leagueCount = 0;
    allTeams.forEach(t => {
      t.players.filter(p => p.position === pos).forEach(p => {
        leagueTotal += p.value;
        leagueCount++;
      });
    });
    const leagueAvg = leagueCount > 0 ? leagueTotal / leagueCount : 1000;

    const starterValue = starters.reduce((sum, p) => sum + p.value, 0);
    const starterAvg = requiredStarters > 0 ? starterValue / requiredStarters : 0;
    const leagueStarterAvg = leagueAvg * 1.5;

    const strengthRatio = (starterAvg / leagueStarterAvg) - 1;
    const depthRatio = (posPlayers.length - requiredStarters) / Math.max(1, requiredStarters);
    const needScore = (strengthRatio * 70) + (depthRatio * 30);

    analysis[pos] = {
      players: posPlayers,
      starters,
      bench,
      requiredStarters,
      starterValue,
      benchValue: bench.reduce((sum, p) => sum + p.value, 0),
      totalValue: posPlayers.reduce((sum, p) => sum + p.value, 0),
      needScore: Math.round(needScore * 10) / 10,
      isNeed: needScore < -10,
      isSurplus: needScore > 15
    };
  });

  return analysis;
}

function getRequiredStarters(position, slots) {
  const direct = slots[position] || 0;
  const flexBonus = ['RB', 'WR', 'TE'].includes(position) ? (slots.FLEX || 0) * 0.33 : 0;
  const sfBonus = ['QB', 'RB', 'WR', 'TE'].includes(position) ? (slots.SUPER_FLEX || 0) * 0.25 : 0;
  return Math.ceil(direct + flexBonus + sfBonus);
}

/**
 * Check if trade is fair
 */
function isFairTrade(v1, v2, tolerance = VALUE_TOLERANCE_PERCENT) {
  if (v1 === 0 && v2 === 0) return false;
  const maxV = Math.max(v1, v2);
  const minV = Math.min(v1, v2);
  return (maxV - minV) / maxV <= tolerance;
}

/**
 * Generate trades between two teams
 */
function generateTrades(team1, team2, team1Needs, team2Needs, maxLineupValue) {
  const trades = [];
  const positions = ['QB', 'RB', 'WR', 'TE'];

  // Strategy 1: Value-based trades between different positions
  positions.forEach(pos1 => {
    positions.forEach(pos2 => {
      if (pos1 === pos2) return;

      const t1Bench = team1Needs[pos1].bench.filter(p => p.value >= MIN_VALUE_THRESHOLD * 2);
      const t2Bench = team2Needs[pos2].bench.filter(p => p.value >= MIN_VALUE_THRESHOLD * 2);

      t1Bench.forEach(p1 => {
        t2Bench.forEach(p2 => {
          if (isFairTrade(p1.value, p2.value, 0.25)) {
            const impact1 = calculateImpact(team1Needs, [p1], [p2], maxLineupValue);
            const impact2 = calculateImpact(team2Needs, [p2], [p1], maxLineupValue);

            trades.push({
              team1Gives: [p1],
              team2Gives: [p2],
              type: '1-for-1',
              positionSwap: `${pos1} ↔ ${pos2}`,
              team1Impact: impact1,
              team2Impact: impact2
            });
          }
        });
      });
    });
  });

  // Strategy 2: 2-for-1 consolidation trades
  positions.forEach(pos => {
    const t1Stars = team1.players.filter(p => p.value >= 2500 && !p.isStarter);
    const t2Depth = team2.players.filter(p => p.value >= 800 && p.value < 2500 && !p.isStarter);

    t1Stars.forEach(star => {
      for (let i = 0; i < t2Depth.length; i++) {
        for (let j = i + 1; j < t2Depth.length; j++) {
          const combo = [t2Depth[i], t2Depth[j]];
          const comboValue = combo.reduce((s, p) => s + p.value, 0);

          if (isFairTrade(star.value, comboValue, 0.35)) {
            const impact1 = calculateImpact(team1Needs, [star], combo, maxLineupValue);
            const impact2 = calculateImpact(team2Needs, combo, [star], maxLineupValue);

            trades.push({
              team1Gives: [star],
              team2Gives: combo,
              type: '1-for-2',
              positionSwap: `${star.position} consolidation`,
              team1Impact: impact1,
              team2Impact: impact2
            });
          }
        }
      }
    });

    // Reverse
    const t2Stars = team2.players.filter(p => p.value >= 2500 && !p.isStarter);
    const t1Depth = team1.players.filter(p => p.value >= 800 && p.value < 2500 && !p.isStarter);

    t2Stars.forEach(star => {
      for (let i = 0; i < t1Depth.length; i++) {
        for (let j = i + 1; j < t1Depth.length; j++) {
          const combo = [t1Depth[i], t1Depth[j]];
          const comboValue = combo.reduce((s, p) => s + p.value, 0);

          if (isFairTrade(star.value, comboValue, 0.35)) {
            const impact1 = calculateImpact(team1Needs, combo, [star], maxLineupValue);
            const impact2 = calculateImpact(team2Needs, [star], combo, maxLineupValue);

            trades.push({
              team1Gives: combo,
              team2Gives: [star],
              type: '2-for-1',
              positionSwap: `${star.position} consolidation`,
              team1Impact: impact1,
              team2Impact: impact2
            });
          }
        }
      }
    });
  });

  return trades;
}

/**
 * Calculate trade impact
 */
function calculateImpact(teamNeeds, playersGiven, playersReceived, maxLineupValue) {
  const valueGiven = playersGiven.reduce((sum, p) => sum + p.value, 0);
  const valueReceived = playersReceived.reduce((sum, p) => sum + p.value, 0);

  let lineupImprovement = 0;
  const starterUpgrades = [];

  playersReceived.forEach(newPlayer => {
    const posAnalysis = teamNeeds[newPlayer.position];
    if (posAnalysis && posAnalysis.starters.length > 0) {
      const worstStarter = posAnalysis.starters[posAnalysis.starters.length - 1];
      if (newPlayer.value > worstStarter.value) {
        const improvement = newPlayer.value - worstStarter.value;
        lineupImprovement += improvement;
        starterUpgrades.push({
          newPlayer: newPlayer.name,
          replaces: worstStarter.name,
          improvement
        });
      }
    }
  });

  let starterLoss = 0;
  playersGiven.forEach(p => {
    if (p.isStarter) starterLoss += p.value * 0.5;
  });

  const netLineupImpact = lineupImprovement - starterLoss;
  const powerChange = (netLineupImpact / maxLineupValue) * 100 * 0.50;

  return {
    valueGiven,
    valueReceived,
    netValue: valueReceived - valueGiven,
    lineupImprovement,
    starterUpgrades,
    estimatedPowerChange: Math.round(powerChange * 10) / 10,
    wouldImproveLineup: lineupImprovement > 0
  };
}

/**
 * Score a trade
 */
function scoreTrade(trade, team1Needs, team2Needs) {
  const t1 = trade.team1Impact;
  const t2 = trade.team2Impact;

  const bothImprove = t1.wouldImproveLineup && t2.wouldImproveLineup;
  const bothHaveUpgrades = (t1.starterUpgrades?.length > 0) && (t2.starterUpgrades?.length > 0);
  const fairExchange = Math.abs(t1.netValue + t2.netValue) < 800;

  let positionalFitScore = 0;
  trade.team1Gives.forEach(p => {
    if (team1Needs[p.position]?.isSurplus) positionalFitScore += 10;
    if (team2Needs[p.position]?.isNeed) positionalFitScore += 15;
  });
  trade.team2Gives.forEach(p => {
    if (team2Needs[p.position]?.isSurplus) positionalFitScore += 10;
    if (team1Needs[p.position]?.isNeed) positionalFitScore += 15;
  });

  const lineupBonus = (t1.wouldImproveLineup ? 25 : 0) + (t2.wouldImproveLineup ? 25 : 0);
  const upgradeBonus = ((t1.starterUpgrades?.length || 0) + (t2.starterUpgrades?.length || 0)) * 20;
  const winWinBonus = bothImprove ? 40 : 0;
  const bothUpgradeBonus = bothHaveUpgrades ? 50 : 0;
  const fairnessBonus = fairExchange ? 20 : 0;

  const score = (
    (t1.estimatedPowerChange + t2.estimatedPowerChange) * 10 +
    positionalFitScore + lineupBonus + upgradeBonus +
    winWinBonus + bothUpgradeBonus + fairnessBonus
  );

  return {
    ...trade,
    bothImprove,
    bothHaveUpgrades,
    fairExchange,
    score: Math.round(score * 10) / 10
  };
}

/**
 * Main function
 */
async function generateRecommendations() {
  const { league, rosters, users, players, dpValuesText, dpPlayerIdsText } = await fetchAllData();

  const isSF = isSuperflexLeague(league);
  const slots = getStartingSlots(league);
  const dpValues = parseCSV(dpValuesText);
  const dpPlayerIds = parseCSV(dpPlayerIdsText);
  const playerValues = matchPlayerValues(players, dpValues, dpPlayerIds, isSF);

  // Build team data
  const teams = rosters.map(roster =>
    buildTeamData(roster, users, playerValues, slots, players)
  );

  // Calculate max lineup value
  const maxLineupValue = Math.max(...teams.map(t =>
    t.starters.reduce((sum, s) => sum + s.value, 0)
  ));

  // Calculate needs for all teams
  const teamNeeds = {};
  teams.forEach(team => {
    teamNeeds[team.rosterId] = analyzeTeamNeeds(team, teams, slots);
  });

  // Generate all trade recommendations
  const allRecommendations = [];

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const team1 = teams[i];
      const team2 = teams[j];

      const trades = generateTrades(
        team1, team2,
        teamNeeds[team1.rosterId],
        teamNeeds[team2.rosterId],
        maxLineupValue
      );

      trades.forEach(trade => {
        const scored = scoreTrade(
          trade,
          teamNeeds[team1.rosterId],
          teamNeeds[team2.rosterId]
        );

        if (scored.score > 0) {
          allRecommendations.push({
            ...scored,
            team1Name: team1.teamName,
            team1Id: team1.rosterId,
            team2Name: team2.teamName,
            team2Id: team2.rosterId
          });
        }
      });
    }
  }

  // Sort by score
  allRecommendations.sort((a, b) => b.score - a.score);

  // Remove duplicates
  const seen = new Set();
  const unique = allRecommendations.filter(trade => {
    const key = [
      ...trade.team1Gives.map(p => p.playerId).sort(),
      '|',
      ...trade.team2Gives.map(p => p.playerId).sort()
    ].join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    recommendations: unique.slice(0, 100),
    teams: teams.map(t => ({
      rosterId: t.rosterId,
      teamName: t.teamName,
      avatar: t.avatar,
      needs: teamNeeds[t.rosterId],
      playerCount: t.players.length,
      totalValue: t.players.reduce((sum, p) => sum + p.value, 0)
    })),
    league: {
      name: league.name,
      season: league.season,
      isSuperFlex: isSF,
      rosterSlots: slots
    },
    lastUpdated: new Date().toISOString()
  };
}

const recommendations = await generateRecommendations();
process.stdout.write(JSON.stringify(recommendations, null, 2));
