// Data loader for Power Rankings
// Calculates team power scores based on roster strength, performance, and positional advantages
const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID || "1235581944008286208";

// DynastyProcess data URLs
const DP_VALUES_URL = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/values.csv";
const DP_PLAYER_IDS_URL = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

/**
 * Parse CSV string into array of objects
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');

  // Parse header row, stripping quotes
  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.replace(/^"|"$/g, '').trim());

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || '';
    });
    return obj;
  });
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

/**
 * Normalize player name for matching
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')  // Remove non-alpha chars
    .replace(/\s+/g, ' ')       // Normalize spaces
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '') // Remove suffixes
    .trim();
}

/**
 * Fetch all required data
 */
async function fetchAllData() {
  const [league, rosters, users, players, dpValuesText, dpPlayerIdsText] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}`).then(r => r.json()),
    fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/rosters`).then(r => r.json()),
    fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/users`).then(r => r.json()),
    fetch('https://api.sleeper.app/v1/players/nfl').then(r => r.json()),
    fetch(DP_VALUES_URL).then(r => r.text()),
    fetch(DP_PLAYER_IDS_URL).then(r => r.text())
  ]);

  // Fetch matchups for performance calculation
  const matchups = [];
  const currentWeek = league.settings?.leg || league.settings?.last_scored_leg || 1;

  for (let week = 1; week <= Math.min(currentWeek, 18); week++) {
    try {
      const weekMatchups = await fetch(
        `https://api.sleeper.app/v1/league/${LEAGUE_ID}/matchups/${week}`
      ).then(r => r.json());

      if (weekMatchups && weekMatchups.length > 0) {
        matchups.push({ week, matchups: weekMatchups });
      }
    } catch (error) {
      console.error(`Error fetching week ${week}:`, error);
    }
  }

  const dpValues = parseCSV(dpValuesText);
  const dpPlayerIds = parseCSV(dpPlayerIdsText);

  return { league, rosters, users, players, dpValues, dpPlayerIds, matchups };
}

/**
 * Detect if league is Superflex based on roster positions
 */
function isSuperflexLeague(league) {
  const positions = league.roster_positions || [];
  return positions.includes('SUPER_FLEX') ||
         positions.filter(p => p === 'QB').length >= 2;
}

/**
 * Get starting roster slots from league settings
 */
function getStartingSlots(league) {
  const positions = league.roster_positions || [];
  const slots = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    FLEX: 0,
    SUPER_FLEX: 0,
    K: 0,
    DEF: 0
  };

  positions.forEach(pos => {
    if (pos && pos !== 'BN' && slots.hasOwnProperty(pos)) {
      slots[pos]++;
    }
  });

  return slots;
}

/**
 * Match DynastyProcess values to Sleeper players using Sleeper ID
 */
function matchPlayerValues(players, dpValues, dpPlayerIds, isSF) {
  const playerValues = new Map();
  const valueColumn = isSF ? 'value_2qb' : 'value_1qb';

  // Create lookup from sleeper_id to player ID record
  const sleeperIdToPlayerRecord = new Map();
  dpPlayerIds.forEach(record => {
    if (record.sleeper_id) {
      sleeperIdToPlayerRecord.set(record.sleeper_id, record);
    }
  });

  // Create lookup from fantasypros_id to dynasty values
  const fpIdToValues = new Map();
  dpValues.forEach(dp => {
    if (dp.fp_id) {
      fpIdToValues.set(dp.fp_id, dp);
    }
  });

  // Create fallback lookup by normalized name + position
  const nameLookup = new Map();
  dpValues.forEach(dp => {
    const key = `${normalizeName(dp.player)}_${dp.pos}`;
    nameLookup.set(key, dp);
  });

  let matchedById = 0;
  let matchedByName = 0;
  let unmatched = 0;

  // Match each Sleeper player
  Object.entries(players).forEach(([playerId, player]) => {
    if (!player || !player.first_name) return;

    const fullName = `${player.first_name} ${player.last_name}`;
    const position = player.position;
    let dpMatch = null;

    // Primary: Match by Sleeper ID → FantasyPros ID → Values
    const playerRecord = sleeperIdToPlayerRecord.get(playerId);
    if (playerRecord && playerRecord.fantasypros_id) {
      dpMatch = fpIdToValues.get(playerRecord.fantasypros_id);
      if (dpMatch) matchedById++;
    }

    // Fallback: Match by normalized name + position
    if (!dpMatch) {
      const key = `${normalizeName(fullName)}_${position}`;
      dpMatch = nameLookup.get(key);
      if (dpMatch) matchedByName++;
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
      unmatched++;
      // Fallback: assign minimal value for unmatched players
      playerValues.set(playerId, {
        value: position === 'K' ? 50 : position === 'DEF' ? 100 : 200,
        name: fullName,
        position,
        team: player.team,
        age: player.age
      });
    }
  });

  console.error(`Player matching: ${matchedById} by ID, ${matchedByName} by name, ${unmatched} unmatched`);

  return playerValues;
}

/**
 * Calculate optimal starting lineup value for a team
 */
function calculateOptimalLineupValue(rosterPlayerIds, playerValues, slots, players) {
  // Group roster players by position with their values
  const byPosition = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DEF: []
  };

  rosterPlayerIds.forEach(playerId => {
    const player = players[playerId];
    if (!player) return;

    const position = player.position;
    const valueData = playerValues.get(playerId);
    const value = valueData?.value || 0;

    if (byPosition[position]) {
      byPosition[position].push({ playerId, value, name: valueData?.name || 'Unknown' });
    }
  });

  // Sort each position by value (descending)
  Object.keys(byPosition).forEach(pos => {
    byPosition[pos].sort((a, b) => b.value - a.value);
  });

  let totalValue = 0;
  const starters = [];
  const used = new Set();

  // Fill required position slots first
  ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(pos => {
    const needed = slots[pos] || 0;
    const available = byPosition[pos];

    for (let i = 0; i < needed && i < available.length; i++) {
      totalValue += available[i].value;
      starters.push({ ...available[i], slot: pos });
      used.add(available[i].playerId);
    }
  });

  // Fill FLEX slots (RB, WR, TE)
  const flexEligible = [...byPosition.RB, ...byPosition.WR, ...byPosition.TE]
    .filter(p => !used.has(p.playerId))
    .sort((a, b) => b.value - a.value);

  for (let i = 0; i < (slots.FLEX || 0) && i < flexEligible.length; i++) {
    totalValue += flexEligible[i].value;
    starters.push({ ...flexEligible[i], slot: 'FLEX' });
    used.add(flexEligible[i].playerId);
  }

  // Fill SUPER_FLEX slots (QB, RB, WR, TE)
  const superFlexEligible = [...byPosition.QB, ...byPosition.RB, ...byPosition.WR, ...byPosition.TE]
    .filter(p => !used.has(p.playerId))
    .sort((a, b) => b.value - a.value);

  for (let i = 0; i < (slots.SUPER_FLEX || 0) && i < superFlexEligible.length; i++) {
    totalValue += superFlexEligible[i].value;
    starters.push({ ...superFlexEligible[i], slot: 'SUPER_FLEX' });
    used.add(superFlexEligible[i].playerId);
  }

  return { totalValue, starters };
}

/**
 * Calculate All-Play record for a team
 */
function calculateAllPlayRecord(rosterId, matchups) {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  matchups.forEach(weekData => {
    const teamMatchup = weekData.matchups.find(m => m.roster_id === rosterId);
    if (!teamMatchup) return;

    const teamScore = teamMatchup.points || 0;

    weekData.matchups.forEach(opponent => {
      if (opponent.roster_id === rosterId) return;

      if (teamScore > opponent.points) wins++;
      else if (teamScore < opponent.points) losses++;
      else ties++;
    });
  });

  const total = wins + losses + ties;
  return {
    wins,
    losses,
    ties,
    winPct: total > 0 ? wins / total : 0
  };
}

/**
 * Calculate positional advantage score
 * Compares team's starters at each position vs league average
 */
function calculatePositionalAdvantage(lineup, allLineups, slots) {
  // Weight positions by scarcity
  const positionWeights = {
    QB: 1.0,
    RB: 1.3,  // RBs are scarce
    WR: 0.9,
    TE: 1.2,  // Elite TEs are rare
    K: 0.3,
    DEF: 0.4,
    FLEX: 0.8,
    SUPER_FLEX: 1.1
  };

  // Calculate average value at each position across league
  const positionAverages = {};
  const positionCounts = {};

  allLineups.forEach(teamLineup => {
    teamLineup.starters.forEach(starter => {
      const slot = starter.slot;
      if (!positionAverages[slot]) {
        positionAverages[slot] = 0;
        positionCounts[slot] = 0;
      }
      positionAverages[slot] += starter.value;
      positionCounts[slot]++;
    });
  });

  Object.keys(positionAverages).forEach(pos => {
    positionAverages[pos] = positionAverages[pos] / (positionCounts[pos] || 1);
  });

  // Calculate this team's advantage at each position
  let totalAdvantage = 0;
  let totalWeight = 0;

  lineup.starters.forEach(starter => {
    const slot = starter.slot;
    const avg = positionAverages[slot] || 1000;
    const advantage = (starter.value - avg) / avg;  // Relative advantage
    const weight = positionWeights[slot] || 1.0;

    totalAdvantage += advantage * weight;
    totalWeight += weight;
  });

  // Normalize to 0-100 scale (50 = average)
  const normalizedAdvantage = 50 + (totalAdvantage / totalWeight) * 50;
  return Math.max(0, Math.min(100, normalizedAdvantage));
}

/**
 * Calculate usable depth score
 * Only counts top backup at each position
 */
function calculateDepthScore(rosterPlayerIds, playerValues, starters, players) {
  const starterIds = new Set(starters.map(s => s.playerId));

  // Group bench players by position
  const benchByPosition = {};

  rosterPlayerIds.forEach(playerId => {
    if (starterIds.has(playerId)) return;

    const player = players[playerId];
    if (!player) return;

    const position = player.position;
    const valueData = playerValues.get(playerId);
    const value = valueData?.value || 0;

    if (!benchByPosition[position]) {
      benchByPosition[position] = [];
    }
    benchByPosition[position].push({ playerId, value });
  });

  // Sum value of top backup at each position
  let depthValue = 0;
  let positions = 0;

  ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
    const bench = benchByPosition[pos] || [];
    if (bench.length > 0) {
      bench.sort((a, b) => b.value - a.value);
      depthValue += bench[0].value;
      positions++;
    }
  });

  // Normalize based on typical backup values (assume 2000 per position is good)
  const targetDepth = positions * 2000;
  return Math.min(100, (depthValue / targetDepth) * 100);
}

/**
 * Calculate power score for a hypothetical roster (for trade simulation)
 */
function calculateTeamPowerScore(rosterPlayerIds, playerValues, slots, players, allLineups, maxLineupValue, performanceScore) {
  const lineupData = calculateOptimalLineupValue(rosterPlayerIds, playerValues, slots, players);
  const lineupValueScore = (lineupData.totalValue / maxLineupValue) * 100;
  const positionalScore = calculatePositionalAdvantage(lineupData, allLineups, slots);
  const depthScore = calculateDepthScore(rosterPlayerIds, playerValues, lineupData.starters, players);

  const powerScore = (
    (lineupValueScore * 0.50) +
    (performanceScore * 0.30) +
    (positionalScore * 0.15) +
    (depthScore * 0.05)
  );

  return {
    powerScore: Math.round(powerScore * 10) / 10,
    lineupValueScore: Math.round(lineupValueScore * 10) / 10,
    positionalScore: Math.round(positionalScore * 10) / 10,
    depthScore: Math.round(depthScore * 10) / 10,
    totalRosterValue: lineupData.totalValue,
    starters: lineupData.starters
  };
}

/**
 * Main power rankings calculation
 */
async function calculatePowerRankings() {
  const { league, rosters, users, players, dpValues, dpPlayerIds, matchups } = await fetchAllData();

  const isSF = isSuperflexLeague(league);
  const slots = getStartingSlots(league);
  const playerValues = matchPlayerValues(players, dpValues, dpPlayerIds, isSF);

  // Calculate lineup values for all teams
  const teamLineups = rosters.map(roster => {
    const rosterPlayers = roster.players || [];
    const lineupData = calculateOptimalLineupValue(rosterPlayers, playerValues, slots, players);
    return {
      rosterId: roster.roster_id,
      ...lineupData
    };
  });

  // Find max lineup value for normalization
  const maxLineupValue = Math.max(...teamLineups.map(t => t.totalValue));

  // Calculate power score for each team
  const powerRankings = rosters.map(roster => {
    const user = users.find(u => u.user_id === roster.owner_id);
    const teamName = user?.display_name || `Team ${roster.roster_id}`;
    const teamLineup = teamLineups.find(t => t.rosterId === roster.roster_id);

    // 1. Optimal Lineup Value (normalized to 0-100)
    const lineupValueScore = (teamLineup.totalValue / maxLineupValue) * 100;

    // 2. Actual Performance
    const allPlay = calculateAllPlayRecord(roster.roster_id, matchups);
    const pointsFor = (roster.settings?.fpts || 0) + ((roster.settings?.fpts_decimal || 0) / 100);
    const wins = roster.settings?.wins || 0;
    const losses = roster.settings?.losses || 0;
    const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0;

    // Performance score: blend of win%, all-play%, and points rank (already 0-100 scale)
    const performanceScore = ((allPlay.winPct * 60) + (winPct * 40));
    const actualPerformanceScore = performanceScore; // Don't multiply by 100 - already 0-100

    // 3. Positional Advantage
    const positionalScore = calculatePositionalAdvantage(teamLineup, teamLineups, slots);

    // 4. Depth Score
    const depthScore = calculateDepthScore(
      roster.players || [],
      playerValues,
      teamLineup.starters,
      players
    );

    // Calculate final Power Score
    const powerScore = (
      (lineupValueScore * 0.50) +
      (actualPerformanceScore * 0.30) +
      (positionalScore * 0.15) +
      (depthScore * 0.05)
    );

    return {
      rosterId: roster.roster_id,
      oderId: roster.owner_id,
      teamName,
      avatar: user?.avatar,

      // Component scores
      lineupValueScore: Math.round(lineupValueScore * 10) / 10,
      performanceScore: Math.round(actualPerformanceScore * 10) / 10,
      positionalScore: Math.round(positionalScore * 10) / 10,
      depthScore: Math.round(depthScore * 10) / 10,

      // Final score
      powerScore: Math.round(powerScore * 10) / 10,

      // Raw data for display
      totalRosterValue: teamLineup.totalValue,
      starters: teamLineup.starters,
      wins,
      losses,
      winPct: Math.round(winPct * 1000) / 10,
      pointsFor: Math.round(pointsFor * 10) / 10,
      allPlayWins: allPlay.wins,
      allPlayLosses: allPlay.losses,
      allPlayWinPct: Math.round(allPlay.winPct * 1000) / 10
    };
  });

  // Sort by power score and assign ranks
  powerRankings.sort((a, b) => b.powerScore - a.powerScore);
  powerRankings.forEach((team, index) => {
    team.powerRank = index + 1;
  });

  // Calculate league metadata
  const leagueInfo = {
    name: league.name,
    season: league.season,
    isSuperFlex: isSF,
    rosterSlots: slots,
    totalTeams: rosters.length,
    currentWeek: league.settings?.leg || 1
  };

  // Create player values lookup for trade simulator (only rostered players + top free agents)
  const playerValuesLookup = {};
  const rosteredPlayerIds = new Set();
  rosters.forEach(roster => {
    (roster.players || []).forEach(pid => rosteredPlayerIds.add(pid));
  });

  // Include all rostered players
  rosteredPlayerIds.forEach(playerId => {
    const valueData = playerValues.get(playerId);
    if (valueData) {
      playerValuesLookup[playerId] = {
        name: valueData.name,
        position: valueData.position,
        team: valueData.team,
        value: valueData.value
      };
    }
  });

  // Create roster lookup for trade simulator
  const rosterLookup = {};
  rosters.forEach(roster => {
    const user = users.find(u => u.user_id === roster.owner_id);
    rosterLookup[roster.roster_id] = {
      oderId: roster.owner_id,
      teamName: user?.display_name || `Team ${roster.roster_id}`,
      players: roster.players || [],
      performanceScore: powerRankings.find(r => r.rosterId === roster.roster_id)?.performanceScore || 50
    };
  });

  return {
    rankings: powerRankings,
    league: leagueInfo,
    playerValues: playerValuesLookup,
    rosters: rosterLookup,
    maxLineupValue,
    lastUpdated: new Date().toISOString()
  };
}

const powerRankings = await calculatePowerRankings();
process.stdout.write(JSON.stringify(powerRankings, null, 2));
