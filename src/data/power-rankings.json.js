// Data loader for Power Rankings
// Calculates team power scores based on roster strength, performance, and positional advantages
const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID;
const LEAGUE_TYPE = process.env.LEAGUE_TYPE || 'dynasty'; // 'dynasty' or 'redraft'

// DynastyProcess data URLs (for dynasty leagues)
const DP_VALUES_URL = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/values.csv";
const DP_PLAYER_IDS_URL = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

// FantasyCalc API for ECR-based trade values (works for both dynasty and redraft)
const FANTASYCALC_API_BASE = "https://api.fantasycalc.com/values/current";

// Static fallback scarcity multipliers (used when FantasyCalc data unavailable)
const STATIC_SCARCITY_FALLBACK = {
  QB: 80,   // QBs are streamable in 1QB
  RB: 150,  // RBs are scarce and injury-prone
  WR: 100,  // Base value - WRs are most abundant
  TE: 120,  // Elite TEs are rare
  K: 20,    // Kickers are highly replaceable
  DEF: 25   // Defenses are streamable
};

const SF_SCARCITY_FALLBACK = {
  QB: 140,  // QBs much more valuable in SF
  RB: 150,
  WR: 100,
  TE: 120,
  K: 20,
  DEF: 25
};

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
 * Fetch FantasyCalc ECR-based values
 * @param {boolean} isDynasty - true for dynasty, false for redraft
 * @param {boolean} isSF - true for superflex/2QB
 * @param {number} numTeams - number of teams in league
 * @param {number} ppr - PPR scoring (0, 0.5, or 1)
 */
async function fetchFantasyCalcValues(isDynasty, isSF, numTeams = 12, ppr = 1) {
  try {
    const numQbs = isSF ? 2 : 1;
    const url = `${FANTASYCALC_API_BASE}?isDynasty=${isDynasty}&numQbs=${numQbs}&numTeams=${numTeams}&ppr=${ppr}`;
    console.error(`📊 Fetching FantasyCalc values: isDynasty=${isDynasty}, numQbs=${numQbs}`);

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`⚠️ FantasyCalc API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.error(`✅ FantasyCalc: Loaded ${data.length} player values`);
    return data;
  } catch (error) {
    console.error(`⚠️ FantasyCalc fetch failed: ${error.message}`);
    return null;
  }
}

/**
 * Fetch Sleeper projections for current week and rest of season
 * @param {string} season - NFL season year
 * @param {number} currentWeek - current NFL week
 */
async function fetchSleeperProjections(season, currentWeek) {
  try {
    const projections = new Map();

    // Fetch projections for remaining weeks (current through 18)
    const weekPromises = [];
    for (let week = currentWeek; week <= 18; week++) {
      weekPromises.push(
        fetch(`https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular`)
          .then(r => r.ok ? r.json() : [])
          .then(data => ({ week, data }))
          .catch(() => ({ week, data: [] }))
      );
    }

    const weekResults = await Promise.all(weekPromises);

    // Aggregate projections - sum remaining weeks for ROS projection
    weekResults.forEach(({ week, data }) => {
      if (!Array.isArray(data)) return;

      data.forEach(proj => {
        const playerId = proj.player?.player_id || proj.player_id;
        if (!playerId) return;

        const pts = proj.stats?.pts_ppr || proj.stats?.pts_half_ppr || 0;

        const existing = projections.get(playerId) || {
          rosPoints: 0,
          weeklyProjections: {},
          player: proj.player
        };

        existing.rosPoints += pts;
        existing.weeklyProjections[week] = pts;
        projections.set(playerId, existing);
      });
    });

    console.error(`✅ Sleeper Projections: Loaded ROS projections for ${projections.size} players (weeks ${currentWeek}-18)`);
    return projections;
  } catch (error) {
    console.error(`⚠️ Sleeper projections fetch failed: ${error.message}`);
    return new Map();
  }
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
 * Calculate dynamic position scarcity using VOR (Value Over Replacement) methodology
 * This recalculates weekly based on current FantasyCalc ECR data
 * @param {Array} fantasyCalcData - FantasyCalc API response with player values
 * @param {Object} slots - League starting slots from getStartingSlots()
 * @param {number} numTeams - Number of teams in league
 * @param {boolean} isSF - Is Superflex league
 * @returns {Object} Position multipliers keyed by position
 */
function calculateDynamicScarcity(fantasyCalcData, slots, numTeams, isSF) {
  // Fallback if no FantasyCalc data
  if (!fantasyCalcData || !Array.isArray(fantasyCalcData) || fantasyCalcData.length === 0) {
    console.error(`⚠️ No FantasyCalc data - using static scarcity fallback`);
    return isSF ? { ...SF_SCARCITY_FALLBACK } : { ...STATIC_SCARCITY_FALLBACK };
  }

  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  const vorMultipliers = {};
  const vorDetails = {};

  positions.forEach(pos => {
    // Get players at this position sorted by ECR rank
    const posPlayers = fantasyCalcData
      .filter(p => p.player?.position === pos)
      .sort((a, b) => (a.positionRank || 999) - (b.positionRank || 999));

    if (posPlayers.length === 0) {
      // No data for this position - use fallback
      vorMultipliers[pos] = isSF && pos === 'QB'
        ? SF_SCARCITY_FALLBACK[pos]
        : STATIC_SCARCITY_FALLBACK[pos];
      return;
    }

    // Calculate starters needed league-wide for this position
    let startersNeeded = (slots[pos] || 0) * numTeams;

    // FLEX eligibility (RB/WR/TE can fill FLEX spots)
    // Estimate 33% of FLEX is filled by each eligible position
    if (['RB', 'WR', 'TE'].includes(pos)) {
      startersNeeded += Math.floor((slots.FLEX || 0) * numTeams * 0.33);
    }

    // SUPER_FLEX eligibility (QB gets ~40% in SF, others split remaining)
    if (pos === 'QB' && isSF) {
      startersNeeded += Math.floor((slots.SUPER_FLEX || 0) * numTeams * 0.4);
    } else if (['RB', 'WR', 'TE'].includes(pos) && isSF) {
      startersNeeded += Math.floor((slots.SUPER_FLEX || 0) * numTeams * 0.2);
    }

    // VOR calculation: Elite value - Replacement level value
    const elitePlayer = posPlayers[0];
    const replacementIndex = Math.min(startersNeeded, posPlayers.length - 1);
    const replacementPlayer = posPlayers[replacementIndex];

    const eliteValue = elitePlayer?.redraftValue || elitePlayer?.value || 0;
    const replacementValue = replacementPlayer?.redraftValue || replacementPlayer?.value || 100;

    // VOR spread = difference between elite and replacement
    const vorSpread = Math.max(0, eliteValue - replacementValue);

    vorMultipliers[pos] = vorSpread;
    vorDetails[pos] = {
      eliteValue,
      replacementValue,
      replacementRank: replacementIndex + 1,
      startersNeeded,
      playersAvailable: posPlayers.length
    };
  });

  // Normalize to 20-200 scale with WR = 100 as baseline
  const wrVor = vorMultipliers['WR'] || 1;
  const normalizedMultipliers = {};

  positions.forEach(pos => {
    let normalized = Math.round((vorMultipliers[pos] / wrVor) * 100);
    // Clamp to reasonable range
    normalized = Math.max(20, Math.min(200, normalized));
    normalizedMultipliers[pos] = normalized;
  });

  // Log the calculated scarcity values
  console.error(`📊 Dynamic Scarcity (VOR):`);
  positions.forEach(pos => {
    const detail = vorDetails[pos];
    if (detail) {
      console.error(`   ${pos}: ${normalizedMultipliers[pos]} (elite=${detail.eliteValue}, repl=${detail.replacementValue} @ rank ${detail.replacementRank})`);
    } else {
      console.error(`   ${pos}: ${normalizedMultipliers[pos]} (fallback)`);
    }
  });

  return normalizedMultipliers;
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
 * Calculate redraft values based on current season fantasy performance
 * Uses PPG from matchups data with positional scarcity weighting
 * @param {Object} scarcityMultipliers - Dynamic VOR-based scarcity multipliers (optional)
 */
function calculateRedraftValues(players, matchups, isSF, scarcityMultipliers = null) {
  // Use static fallback if no dynamic scarcity provided
  const multipliers = scarcityMultipliers || (isSF ? SF_SCARCITY_FALLBACK : STATIC_SCARCITY_FALLBACK);
  const playerValues = new Map();
  const playerStats = new Map(); // Track games and total points per player

  // Aggregate player stats from all matchups
  matchups.forEach(weekData => {
    weekData.matchups.forEach(matchup => {
      const starters = matchup.starters || [];
      const playerPoints = matchup.players_points || {};

      Object.entries(playerPoints).forEach(([playerId, points]) => {
        if (points === null || points === undefined) return;

        const existing = playerStats.get(playerId) || { games: 0, totalPoints: 0, starterGames: 0 };
        existing.games++;
        existing.totalPoints += points;
        if (starters.includes(playerId)) {
          existing.starterGames++;
        }
        playerStats.set(playerId, existing);
      });
    });
  });

  // Calculate PPG and convert to value
  Object.entries(players).forEach(([playerId, player]) => {
    if (!player || !player.first_name) return;

    const fullName = `${player.first_name} ${player.last_name}`;
    const position = player.position;
    const stats = playerStats.get(playerId);

    let value = 0;
    let ppg = 0;

    if (stats && stats.games > 0) {
      ppg = stats.totalPoints / stats.games;

      // Get dynamic VOR-based position multiplier
      const posMultiplier = multipliers[position] || 50;

      // Value = PPG * position multiplier
      // This creates values roughly comparable to dynasty values (1000-9000 range)
      value = Math.round(ppg * posMultiplier);

      // Bonus for consistent starters (started >50% of games played)
      if (stats.starterGames > stats.games * 0.5) {
        value = Math.round(value * 1.1);
      }
    } else {
      // No stats - assign minimal value based on position
      value = position === 'K' ? 50 : position === 'DEF' ? 100 : 200;
    }

    playerValues.set(playerId, {
      value,
      ppg: Math.round(ppg * 10) / 10,
      gamesPlayed: stats?.games || 0,
      name: fullName,
      position,
      team: player.team,
      age: player.age
    });
  });

  // Log some stats
  const withValue = Array.from(playerValues.values()).filter(p => p.value > 200);
  console.error(`Redraft values (PPG-based): ${withValue.length} players with meaningful production`);

  return playerValues;
}

/**
 * Calculate enhanced redraft values using FantasyCalc ECR + Sleeper projections
 * Primary: FantasyCalc ECR trade values (market-based)
 * Secondary: Sleeper ROS projections (forward-looking)
 * Fallback: PPG-based calculation with dynamic scarcity (historical)
 * @param {Object} scarcityMultipliers - Dynamic VOR-based scarcity multipliers
 */
function calculateEnhancedRedraftValues(players, matchups, fantasyCalcData, sleeperProjections, isSF, scarcityMultipliers) {
  const playerValues = new Map();

  // Create FantasyCalc lookup by sleeperId
  const fcLookup = new Map();
  if (fantasyCalcData && Array.isArray(fantasyCalcData)) {
    fantasyCalcData.forEach(fc => {
      if (fc.player?.sleeperId) {
        fcLookup.set(fc.player.sleeperId, fc);
      }
    });
  }

  // Calculate PPG from matchups as fallback
  const playerStats = new Map();
  matchups.forEach(weekData => {
    weekData.matchups.forEach(matchup => {
      const starters = matchup.starters || [];
      const playerPoints = matchup.players_points || {};

      Object.entries(playerPoints).forEach(([playerId, points]) => {
        if (points === null || points === undefined) return;

        const existing = playerStats.get(playerId) || { games: 0, totalPoints: 0, starterGames: 0 };
        existing.games++;
        existing.totalPoints += points;
        if (starters.includes(playerId)) {
          existing.starterGames++;
        }
        playerStats.set(playerId, existing);
      });
    });
  });

  let fcMatches = 0;
  let projMatches = 0;
  let ppgFallback = 0;

  // Build player values
  Object.entries(players).forEach(([playerId, player]) => {
    if (!player || !player.first_name) return;

    const fullName = `${player.first_name} ${player.last_name}`;
    const position = player.position;
    const stats = playerStats.get(playerId);
    const fcData = fcLookup.get(playerId);
    const projData = sleeperProjections?.get(playerId);

    let value = 0;
    let valueSource = 'none';
    let ecrRank = null;
    let posRank = null;
    let tier = null;
    let rosProjection = null;
    let ppg = stats && stats.games > 0 ? stats.totalPoints / stats.games : 0;

    // Primary: FantasyCalc ECR value
    if (fcData) {
      value = fcData.redraftValue || fcData.value || 0;
      ecrRank = fcData.overallRank;
      posRank = fcData.positionRank;
      tier = fcData.maybeTier;
      valueSource = 'fantasycalc';
      fcMatches++;
    }

    // Add ROS projection bonus/adjustment
    if (projData && projData.rosPoints > 0) {
      rosProjection = Math.round(projData.rosPoints * 10) / 10;

      if (valueSource === 'fantasycalc') {
        // Blend ECR with projections - 70% ECR, 30% projection-based adjustment
        const projValue = rosProjection * 50; // Scale projections to value range
        value = Math.round(value * 0.7 + projValue * 0.3);
      } else {
        // Use projections as primary if no FCR
        value = Math.round(rosProjection * 50);
        valueSource = 'projection';
        projMatches++;
      }
    }

    // Fallback: PPG-based calculation with dynamic scarcity
    if (value === 0 && stats && stats.games > 0) {
      // Use dynamic VOR-based scarcity multiplier
      const multiplier = scarcityMultipliers[position] || 50;
      value = Math.round(ppg * multiplier);

      // Bonus for consistent starters
      if (stats.starterGames > stats.games * 0.5) {
        value = Math.round(value * 1.1);
      }
      valueSource = 'ppg';
      ppgFallback++;
    }

    // Minimum value for rostered players
    if (value === 0) {
      value = position === 'K' ? 50 : position === 'DEF' ? 100 : 200;
    }

    playerValues.set(playerId, {
      value,
      valueSource,
      ecrRank,
      positionRank: posRank,
      tier,
      rosProjection,
      ppg: Math.round(ppg * 10) / 10,
      gamesPlayed: stats?.games || 0,
      name: fullName,
      position,
      team: player.team,
      age: player.age
    });
  });

  console.error(`📊 Enhanced Redraft Values:`);
  console.error(`   FantasyCalc ECR matches: ${fcMatches}`);
  console.error(`   Sleeper projection matches: ${projMatches}`);
  console.error(`   PPG fallback: ${ppgFallback}`);

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
function calculateTeamPowerScore(rosterPlayerIds, playerValues, slots, players, allLineups, maxLineupValue, performanceScore, weights = null) {
  // Default weights if not provided (dynasty defaults)
  const w = weights || { lineup: 0.50, performance: 0.30, positional: 0.15, depth: 0.05 };

  const lineupData = calculateOptimalLineupValue(rosterPlayerIds, playerValues, slots, players);
  const lineupValueScore = (lineupData.totalValue / maxLineupValue) * 100;
  const positionalScore = calculatePositionalAdvantage(lineupData, allLineups, slots);
  const depthScore = calculateDepthScore(rosterPlayerIds, playerValues, lineupData.starters, players);

  const powerScore = (
    (lineupValueScore * w.lineup) +
    (performanceScore * w.performance) +
    (positionalScore * w.positional) +
    (depthScore * w.depth)
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
  console.error(`\n🏈 Power Rankings Calculator`);
  console.error(`📊 League Type: ${LEAGUE_TYPE.toUpperCase()}`);

  const { league, rosters, users, players, dpValues, dpPlayerIds, matchups } = await fetchAllData();

  const isSF = isSuperflexLeague(league);
  const slots = getStartingSlots(league);
  const numTeams = rosters.length;
  const currentWeek = league.settings?.leg || league.settings?.last_scored_leg || 1;

  // Choose value source based on league type
  let playerValues;
  let valueSourceDetails = {};

  // Variable to store scarcity multipliers (for output metadata)
  let scarcityMultipliers = null;

  if (LEAGUE_TYPE === 'redraft') {
    console.error(`📈 Using ENHANCED REDRAFT values (FantasyCalc ECR + Sleeper Projections)`);

    // Fetch external data sources for redraft
    const [fantasyCalcData, sleeperProjections] = await Promise.all([
      fetchFantasyCalcValues(false, isSF, numTeams, 1), // isDynasty=false for redraft
      fetchSleeperProjections(league.season, currentWeek)
    ]);

    // Calculate dynamic scarcity using VOR methodology
    scarcityMultipliers = calculateDynamicScarcity(fantasyCalcData, slots, numTeams, isSF);

    playerValues = calculateEnhancedRedraftValues(
      players,
      matchups,
      fantasyCalcData,
      sleeperProjections,
      isSF,
      scarcityMultipliers
    );

    valueSourceDetails = {
      primary: 'FantasyCalc ECR',
      secondary: 'Sleeper ROS Projections',
      fallback: 'Current Season PPG (VOR-weighted)',
      fantasyCalcLoaded: fantasyCalcData ? fantasyCalcData.length : 0,
      projectionsLoaded: sleeperProjections ? sleeperProjections.size : 0,
      scarcityMethod: 'vor',
      scarcityMultipliers
    };
  } else {
    console.error(`📈 Using DYNASTY values (DynastyProcess trade values)`);
    playerValues = matchPlayerValues(players, dpValues, dpPlayerIds, isSF);

    valueSourceDetails = {
      primary: 'DynastyProcess Trade Values',
      secondary: null,
      fallback: null
    };
  }

  // Adjust component weights based on league type
  // Redraft: Performance matters more, lineup value (long-term assets) matters less
  const weights = LEAGUE_TYPE === 'redraft'
    ? { lineup: 0.35, performance: 0.45, positional: 0.15, depth: 0.05 }
    : { lineup: 0.50, performance: 0.30, positional: 0.15, depth: 0.05 };

  console.error(`⚖️  Weights: Lineup ${weights.lineup * 100}%, Performance ${weights.performance * 100}%, Positional ${weights.positional * 100}%, Depth ${weights.depth * 100}%`);

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

    // Calculate final Power Score using dynamic weights
    const powerScore = (
      (lineupValueScore * weights.lineup) +
      (actualPerformanceScore * weights.performance) +
      (positionalScore * weights.positional) +
      (depthScore * weights.depth)
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
    leagueType: LEAGUE_TYPE,
    isSuperFlex: isSF,
    rosterSlots: slots,
    totalTeams: rosters.length,
    currentWeek: league.settings?.leg || 1,
    weights: weights,
    valueSource: valueSourceDetails
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
      const lookup = {
        name: valueData.name,
        position: valueData.position,
        team: valueData.team,
        value: valueData.value
      };

      // Include enhanced data for redraft leagues
      if (LEAGUE_TYPE === 'redraft') {
        if (valueData.ppg !== undefined) lookup.ppg = valueData.ppg;
        if (valueData.gamesPlayed !== undefined) lookup.gamesPlayed = valueData.gamesPlayed;
        if (valueData.ecrRank !== undefined) lookup.ecrRank = valueData.ecrRank;
        if (valueData.positionRank !== undefined) lookup.positionRank = valueData.positionRank;
        if (valueData.tier !== undefined) lookup.tier = valueData.tier;
        if (valueData.rosProjection !== undefined) lookup.rosProjection = valueData.rosProjection;
        if (valueData.valueSource !== undefined) lookup.valueSource = valueData.valueSource;
      }

      playerValuesLookup[playerId] = lookup;
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
    weights,
    lastUpdated: new Date().toISOString()
  };
}

const powerRankings = await calculatePowerRankings();
process.stdout.write(JSON.stringify(powerRankings, null, 2));
