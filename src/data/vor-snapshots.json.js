// Data loader for VOR (Value Over Replacement) Snapshots
// Captures weekly scarcity multipliers for historical trade analysis
// Each week's VOR values are preserved so historical trades can be analyzed accurately

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID;
const LEAGUE_TYPE = process.env.LEAGUE_TYPE || 'dynasty';

// Static fallback scarcity multipliers (used when no snapshot available)
const STATIC_SCARCITY_FALLBACK = {
  QB: 80,
  RB: 150,
  WR: 100,
  TE: 120,
  K: 20,
  DEF: 25
};

const SF_SCARCITY_FALLBACK = {
  QB: 140,
  RB: 150,
  WR: 100,
  TE: 120,
  K: 20,
  DEF: 25
};

/**
 * Load existing VOR snapshots from the history file
 * This file is automatically populated by power-rankings.json.js when generating rankings
 */
function loadExistingSnapshots() {
  const snapshotsPath = join(__dirname, 'vor-snapshots-history.json');

  if (existsSync(snapshotsPath)) {
    try {
      const data = JSON.parse(readFileSync(snapshotsPath, 'utf-8'));
      console.error(`✅ Loaded ${data.snapshots?.length || 0} VOR snapshots from history`);
      return data;
    } catch (error) {
      console.error(`⚠️ Error reading VOR snapshots: ${error.message}`);
      return { snapshots: [] };
    }
  }

  console.error(`📭 No VOR snapshot history found - will be created on next power rankings build`);
  return { snapshots: [] };
}

/**
 * Load current power rankings to get latest VOR data
 */
function loadCurrentPowerRankings() {
  const cacheDir = join(__dirname, '..', '.observablehq', 'cache', 'data');
  const powerRankingsPath = join(cacheDir, 'power-rankings.json');

  if (existsSync(powerRankingsPath)) {
    try {
      return JSON.parse(readFileSync(powerRankingsPath, 'utf-8'));
    } catch (error) {
      console.error(`⚠️ Error reading power rankings: ${error.message}`);
      return null;
    }
  }

  return null;
}

/**
 * Get fallback scarcity for a specific season phase
 * Early season uses more conservative/static values
 * Late season values shift based on typical patterns
 */
function getSeasonPhaseScarcity(week, isSF) {
  const base = isSF ? { ...SF_SCARCITY_FALLBACK } : { ...STATIC_SCARCITY_FALLBACK };

  // Adjust scarcity based on season phase
  if (week <= 3) {
    // Early season - RBs even more valuable (injury uncertainty)
    base.RB = Math.round(base.RB * 1.1);
  } else if (week >= 10 && week <= 13) {
    // Playoff push - TEs and consistent performers more valuable
    base.TE = Math.round(base.TE * 1.1);
    base.RB = Math.round(base.RB * 1.05);
  } else if (week >= 14) {
    // Playoffs - matchup-proof players premium
    base.QB = Math.round(base.QB * 1.1);
  }

  return base;
}

/**
 * Find the best matching snapshot for a given week/season
 */
function findSnapshotForTrade(snapshots, tradeSeason, tradeWeek, isSF) {
  // Look for exact match first
  const exactMatch = snapshots.find(s =>
    s.season === tradeSeason && s.week === tradeWeek
  );

  if (exactMatch) {
    return {
      source: 'exact',
      snapshot: exactMatch
    };
  }

  // Look for closest week in same season
  const sameSeasonSnapshots = snapshots
    .filter(s => s.season === tradeSeason)
    .sort((a, b) => Math.abs(a.week - tradeWeek) - Math.abs(b.week - tradeWeek));

  if (sameSeasonSnapshots.length > 0) {
    const closest = sameSeasonSnapshots[0];
    return {
      source: 'closest',
      snapshot: closest,
      weekDifference: Math.abs(closest.week - tradeWeek)
    };
  }

  // Fallback to season phase defaults
  return {
    source: 'fallback',
    snapshot: {
      season: tradeSeason,
      week: tradeWeek,
      scarcityMultipliers: getSeasonPhaseScarcity(tradeWeek, isSF),
      isFallback: true
    }
  };
}

async function generateVorSnapshots() {
  const existingData = loadExistingSnapshots();
  const powerRankings = loadCurrentPowerRankings();

  let currentSnapshot = null;

  // Extract current VOR data from power rankings if available
  if (powerRankings?.league?.valueSource?.scarcityMultipliers) {
    const currentWeek = powerRankings.league.currentWeek;
    const currentSeason = powerRankings.league.season;
    const isSF = powerRankings.league.isSuperFlex;

    currentSnapshot = {
      season: currentSeason,
      week: currentWeek,
      scarcityMultipliers: powerRankings.league.valueSource.scarcityMultipliers,
      scarcityMethod: powerRankings.league.valueSource.scarcityMethod || 'vor',
      isSuperFlex: isSF,
      capturedAt: new Date().toISOString()
    };

    // Check if we already have this week's snapshot
    const existingWeekSnapshot = existingData.snapshots.find(s =>
      s.season === currentSeason && s.week === currentWeek
    );

    if (!existingWeekSnapshot) {
      console.error(`📸 Captured new VOR snapshot for ${currentSeason} Week ${currentWeek}`);
    } else {
      console.error(`✓ VOR snapshot already exists for ${currentSeason} Week ${currentWeek}`);
    }
  }

  // Output format includes helper methods info
  const output = {
    leagueId: LEAGUE_ID,
    leagueType: LEAGUE_TYPE,
    snapshots: existingData.snapshots,
    currentSnapshot,
    fallbacks: {
      standard: STATIC_SCARCITY_FALLBACK,
      superflex: SF_SCARCITY_FALLBACK
    },
    lastUpdated: new Date().toISOString(),
    usage: {
      description: 'Use findSnapshotForTrade() logic to get appropriate VOR values for historical trades',
      example: 'For a Week 4 2024 trade, look for exact match, then closest week in season, then fallback'
    }
  };

  return output;
}

const vorSnapshots = await generateVorSnapshots();
process.stdout.write(JSON.stringify(vorSnapshots, null, 2));
