#!/usr/bin/env node

/**
 * Trade Recommendation Engine
 *
 * Generates mutually beneficial trade recommendations by:
 * 1. Analyzing each team's positional strengths and weaknesses
 * 2. Finding trades that improve both teams' power scores
 * 3. Ensuring fair value exchange (within configurable tolerance)
 *
 * Usage:
 *   node src/data/generate-trade-recommendations.js
 *   node src/data/generate-trade-recommendations.js --team "TeamName"
 *   node src/data/generate-trade-recommendations.js --teams "Team1" "Team2"
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID || "1235581944008286208";

// Trade fairness tolerance (how much value difference is acceptable)
const VALUE_TOLERANCE_PERCENT = 0.30; // 30% tolerance for fair trades
const MIN_VALUE_THRESHOLD = 300; // Minimum player value to consider trading
const MAX_TRADE_SIZE = 3; // Maximum players per side in a trade
const DEBUG = false; // Set to true for verbose output

/**
 * Load data from cache
 */
async function loadData() {
  const cacheDir = join(__dirname, '..', '.observablehq', 'cache', 'data');

  // Load power rankings (required)
  const powerRankingsPath = join(cacheDir, 'power-rankings.json');
  if (!existsSync(powerRankingsPath)) {
    throw new Error('Power rankings data not found. Run "npm run build" first.');
  }
  const powerRankings = JSON.parse(readFileSync(powerRankingsPath, 'utf-8'));

  // Load players
  const playersPath = join(cacheDir, 'players.json');
  if (!existsSync(playersPath)) {
    throw new Error('Players data not found. Run "npm run build" first.');
  }
  const players = JSON.parse(readFileSync(playersPath, 'utf-8'));

  return { powerRankings, players };
}

/**
 * Get team roster with player details and values
 */
function getTeamRoster(rosterId, powerRankings, players) {
  const roster = powerRankings.rosters[rosterId];
  if (!roster) return null;

  const teamData = powerRankings.rankings.find(r => r.rosterId === parseInt(rosterId));
  const starterIds = new Set((teamData?.starters || []).map(s => s.playerId));

  const rosterPlayers = roster.players.map(playerId => {
    const playerValue = powerRankings.playerValues[playerId];
    const player = players[playerId];

    if (!playerValue || !player) return null;

    return {
      playerId,
      name: playerValue.name,
      position: playerValue.position,
      team: playerValue.team,
      value: playerValue.value,
      age: player.age,
      isStarter: starterIds.has(playerId)
    };
  }).filter(p => p !== null);

  return {
    rosterId: parseInt(rosterId),
    teamName: roster.teamName,
    players: rosterPlayers,
    performanceScore: roster.performanceScore
  };
}

/**
 * Analyze team's positional needs and surpluses
 */
function analyzeTeamNeeds(teamRoster, powerRankings, league) {
  const positions = ['QB', 'RB', 'WR', 'TE'];
  const slots = league.rosterSlots;

  // Group players by position
  const byPosition = {};
  positions.forEach(pos => {
    byPosition[pos] = teamRoster.players
      .filter(p => p.position === pos)
      .sort((a, b) => b.value - a.value);
  });

  // Calculate position needs based on:
  // 1. Required starters at position
  // 2. Current player values vs league average
  // 3. Depth at position

  const analysis = {};
  const allTeams = Object.keys(powerRankings.rosters);

  positions.forEach(pos => {
    const posPlayers = byPosition[pos];
    const requiredStarters = getRequiredStarters(pos, slots);

    // Get league average value at this position
    let leagueTotal = 0;
    let leagueCount = 0;

    allTeams.forEach(rid => {
      const roster = powerRankings.rosters[rid];
      roster.players.forEach(pid => {
        const pv = powerRankings.playerValues[pid];
        if (pv && pv.position === pos) {
          leagueTotal += pv.value;
          leagueCount++;
        }
      });
    });

    const leagueAvg = leagueCount > 0 ? leagueTotal / leagueCount : 1000;

    // Calculate team's position strength
    const teamPositionValue = posPlayers.reduce((sum, p) => sum + p.value, 0);
    const starterValue = posPlayers.slice(0, requiredStarters).reduce((sum, p) => sum + p.value, 0);
    const benchValue = posPlayers.slice(requiredStarters).reduce((sum, p) => sum + p.value, 0);

    // Determine if this is a need or surplus
    const starterAvgValue = requiredStarters > 0 ? starterValue / requiredStarters : 0;
    const leagueStarterAvg = leagueAvg * 1.5; // Starters should be above average

    // Calculate need score (-100 to +100)
    // Negative = need, Positive = surplus
    const strengthRatio = (starterAvgValue / leagueStarterAvg) - 1;
    const depthRatio = (posPlayers.length - requiredStarters) / Math.max(1, requiredStarters);

    const needScore = (strengthRatio * 70) + (depthRatio * 30);

    analysis[pos] = {
      players: posPlayers,
      starters: posPlayers.slice(0, requiredStarters),
      bench: posPlayers.slice(requiredStarters),
      requiredStarters,
      starterValue,
      benchValue,
      totalValue: teamPositionValue,
      leagueAvg,
      needScore: Math.round(needScore * 10) / 10,
      isNeed: needScore < -10,
      isSurplus: needScore > 15
    };
  });

  return analysis;
}

/**
 * Get required starters for a position
 */
function getRequiredStarters(position, slots) {
  const direct = slots[position] || 0;

  // FLEX can use RB, WR, TE
  const flexBonus = ['RB', 'WR', 'TE'].includes(position) ? (slots.FLEX || 0) * 0.33 : 0;

  // SUPER_FLEX can use QB, RB, WR, TE
  const sfBonus = ['QB', 'RB', 'WR', 'TE'].includes(position) ? (slots.SUPER_FLEX || 0) * 0.25 : 0;

  return Math.ceil(direct + flexBonus + sfBonus);
}

/**
 * Calculate power score change from a hypothetical trade
 * This simulates how the trade would affect the starting lineup
 */
function calculateTradeImpact(team, playersGiven, playersReceived, powerRankings, teamNeeds) {
  const valueGiven = playersGiven.reduce((sum, p) => sum + p.value, 0);
  const valueReceived = playersReceived.reduce((sum, p) => sum + p.value, 0);
  const netValue = valueReceived - valueGiven;

  // Calculate actual lineup improvement
  // Check if received players would start over current starters
  let lineupImprovement = 0;
  let starterUpgrades = [];

  playersReceived.forEach(newPlayer => {
    const posAnalysis = teamNeeds[newPlayer.position];
    if (posAnalysis && posAnalysis.starters.length > 0) {
      // Find the worst starter at this position
      const worstStarter = posAnalysis.starters[posAnalysis.starters.length - 1];
      if (newPlayer.value > worstStarter.value) {
        // This player would start!
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

  // Penalty for giving up starters
  let starterLoss = 0;
  playersGiven.forEach(player => {
    if (player.isStarter) {
      starterLoss += player.value * 0.5; // Penalty for trading starters
    }
  });

  // Net lineup impact
  const netLineupImpact = lineupImprovement - starterLoss;

  // Lineup value is 50% of power score, normalized
  const powerScoreImpact = (netLineupImpact / powerRankings.maxLineupValue) * 100 * 0.50;

  return {
    valueGiven,
    valueReceived,
    netValue,
    lineupImprovement,
    starterUpgrades,
    starterLoss,
    estimatedPowerChange: Math.round(powerScoreImpact * 10) / 10,
    wouldImproveLineup: lineupImprovement > 0
  };
}

/**
 * Check if a trade is fair (within tolerance)
 */
function isFairTrade(side1Value, side2Value, tolerance = VALUE_TOLERANCE_PERCENT) {
  if (side1Value === 0 && side2Value === 0) return false;

  const maxValue = Math.max(side1Value, side2Value);
  const minValue = Math.min(side1Value, side2Value);

  // Calculate percentage difference
  const diff = (maxValue - minValue) / maxValue;

  return diff <= tolerance;
}

/**
 * Generate trade combinations between two teams
 */
function generateTradeCombinations(team1Needs, team2Needs, maxSize = MAX_TRADE_SIZE) {
  const trades = [];
  const positions = ['QB', 'RB', 'WR', 'TE'];

  // Strategy 1: Perfect complementary needs (Team 1 surplus -> Team 2 need AND vice versa)
  positions.forEach(pos1 => {
    positions.forEach(pos2 => {
      if (pos1 === pos2) return; // Different positions

      const t1Analysis = team1Needs[pos1];
      const t2Analysis = team2Needs[pos2];

      // Team 1 has surplus at pos1, Team 2 needs pos1
      // Team 2 has surplus at pos2, Team 1 needs pos2
      if (t1Analysis.isSurplus && team2Needs[pos1].isNeed &&
          t2Analysis.isSurplus && team1Needs[pos2].isNeed) {

        const team1Candidates = t1Analysis.bench.filter(p => p.value >= MIN_VALUE_THRESHOLD);
        const team2Candidates = t2Analysis.bench.filter(p => p.value >= MIN_VALUE_THRESHOLD);

        team1Candidates.forEach(p1 => {
          team2Candidates.forEach(p2 => {
            if (isFairTrade(p1.value, p2.value)) {
              trades.push({
                team1Gives: [p1],
                team2Gives: [p2],
                type: '1-for-1 (complementary)',
                positionSwap: `${pos1} ↔ ${pos2}`
              });
            }
          });
        });
      }
    });
  });

  // Strategy 2: One-sided need fulfillment with fair value
  // Team 1 needs pos, Team 2 has tradeable player at pos
  positions.forEach(needPos => {
    positions.forEach(givePos => {
      const t1NeedsPos = team1Needs[needPos].isNeed;
      const t2HasSurplus = team2Needs[needPos].bench.length > 0;
      const t1CanGive = team1Needs[givePos].bench.length > 0;

      if (t1NeedsPos && t2HasSurplus && t1CanGive) {
        const t2Candidates = team2Needs[needPos].bench.filter(p => p.value >= MIN_VALUE_THRESHOLD);
        const t1Candidates = team1Needs[givePos].bench.filter(p => p.value >= MIN_VALUE_THRESHOLD);

        t2Candidates.forEach(p2 => {
          t1Candidates.forEach(p1 => {
            if (isFairTrade(p1.value, p2.value)) {
              trades.push({
                team1Gives: [p1],
                team2Gives: [p2],
                type: '1-for-1 (need)',
                positionSwap: `${givePos} → ${needPos}`
              });
            }
          });
        });
      }

      // Reverse: Team 2 needs, Team 1 can provide
      const t2NeedsPos = team2Needs[needPos].isNeed;
      const t1HasSurplus = team1Needs[needPos].bench.length > 0;
      const t2CanGive = team2Needs[givePos].bench.length > 0;

      if (t2NeedsPos && t1HasSurplus && t2CanGive) {
        const t1Candidates = team1Needs[needPos].bench.filter(p => p.value >= MIN_VALUE_THRESHOLD);
        const t2Candidates = team2Needs[givePos].bench.filter(p => p.value >= MIN_VALUE_THRESHOLD);

        t1Candidates.forEach(p1 => {
          t2Candidates.forEach(p2 => {
            if (isFairTrade(p1.value, p2.value)) {
              trades.push({
                team1Gives: [p1],
                team2Gives: [p2],
                type: '1-for-1 (need)',
                positionSwap: `${needPos} → ${givePos}`
              });
            }
          });
        });
      }
    });
  });

  // Strategy 3: Value-based trades (any bench player for similar value)
  const allTeam1Bench = positions.flatMap(pos =>
    team1Needs[pos].bench.filter(p => p.value >= MIN_VALUE_THRESHOLD * 2)
  );
  const allTeam2Bench = positions.flatMap(pos =>
    team2Needs[pos].bench.filter(p => p.value >= MIN_VALUE_THRESHOLD * 2)
  );

  allTeam1Bench.forEach(p1 => {
    allTeam2Bench.forEach(p2 => {
      if (p1.position !== p2.position && isFairTrade(p1.value, p2.value, 0.25)) {
        trades.push({
          team1Gives: [p1],
          team2Gives: [p2],
          type: '1-for-1 (value)',
          positionSwap: `${p1.position} ↔ ${p2.position}`
        });
      }
    });
  });

  // Strategy 4: 2-for-1 consolidation trades
  positions.forEach(pos => {
    // Team 1 has high value player, Team 2 has depth
    const t1Stars = team1Needs[pos].players.filter(p => p.value >= 2500 && !p.isStarter);
    const t2Depth = [];
    positions.forEach(otherPos => {
      t2Depth.push(...team2Needs[otherPos].players.filter(p =>
        p.value >= 800 && p.value < 2500 && !p.isStarter
      ));
    });

    t1Stars.forEach(star => {
      for (let i = 0; i < t2Depth.length; i++) {
        for (let j = i + 1; j < t2Depth.length; j++) {
          const combo = [t2Depth[i], t2Depth[j]];
          const comboValue = combo.reduce((s, p) => s + p.value, 0);

          if (isFairTrade(star.value, comboValue, 0.35)) {
            trades.push({
              team1Gives: [star],
              team2Gives: combo,
              type: '1-for-2',
              positionSwap: `${pos} consolidation`
            });
          }
        }
      }
    });

    // Reverse: Team 2 has star, Team 1 has depth
    const t2Stars = team2Needs[pos].players.filter(p => p.value >= 2500 && !p.isStarter);
    const t1Depth = [];
    positions.forEach(otherPos => {
      t1Depth.push(...team1Needs[otherPos].players.filter(p =>
        p.value >= 800 && p.value < 2500 && !p.isStarter
      ));
    });

    t2Stars.forEach(star => {
      for (let i = 0; i < t1Depth.length; i++) {
        for (let j = i + 1; j < t1Depth.length; j++) {
          const combo = [t1Depth[i], t1Depth[j]];
          const comboValue = combo.reduce((s, p) => s + p.value, 0);

          if (isFairTrade(star.value, comboValue, 0.35)) {
            trades.push({
              team1Gives: combo,
              team2Gives: [star],
              type: '2-for-1',
              positionSwap: `${pos} consolidation`
            });
          }
        }
      }
    });
  });

  // Remove duplicates
  const seen = new Set();
  return trades.filter(trade => {
    const key = [
      ...trade.team1Gives.map(p => p.playerId).sort(),
      '|',
      ...trade.team2Gives.map(p => p.playerId).sort()
    ].join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Score a trade recommendation based on how much it helps both teams
 */
function scoreTradeRecommendation(trade, team1, team2, team1Needs, team2Needs, powerRankings) {
  // Pass teamNeeds to calculateTradeImpact
  const team1Impact = calculateTradeImpact(team1, trade.team1Gives, trade.team2Gives, powerRankings, team1Needs);
  const team2Impact = calculateTradeImpact(team2, trade.team2Gives, trade.team1Gives, powerRankings, team2Needs);

  // Both teams should gain power score (or at least not lose much)
  const bothImprove = team1Impact.wouldImproveLineup && team2Impact.wouldImproveLineup;
  const bothHaveUpgrades = (team1Impact.starterUpgrades?.length > 0) && (team2Impact.starterUpgrades?.length > 0);
  const fairExchange = Math.abs(team1Impact.netValue + team2Impact.netValue) < 800;

  // Calculate positional fit bonus
  let positionalFitScore = 0;

  trade.team1Gives.forEach(p => {
    const analysis = team1Needs[p.position];
    if (analysis && analysis.isSurplus) positionalFitScore += 10;
  });

  trade.team2Gives.forEach(p => {
    const analysis = team2Needs[p.position];
    if (analysis && analysis.isSurplus) positionalFitScore += 10;
  });

  trade.team1Gives.forEach(p => {
    const analysis = team2Needs[p.position];
    if (analysis && analysis.isNeed) positionalFitScore += 15;
  });

  trade.team2Gives.forEach(p => {
    const analysis = team1Needs[p.position];
    if (analysis && analysis.isNeed) positionalFitScore += 15;
  });

  // Lineup improvement bonuses
  const lineupBonus1 = team1Impact.wouldImproveLineup ? 25 : 0;
  const lineupBonus2 = team2Impact.wouldImproveLineup ? 25 : 0;

  // Starter upgrade bonuses (big bonus for getting players that would actually start)
  const starterUpgradeBonus = (
    (team1Impact.starterUpgrades?.length || 0) * 20 +
    (team2Impact.starterUpgrades?.length || 0) * 20
  );

  // Combined score
  const combinedPowerGain = team1Impact.estimatedPowerChange + team2Impact.estimatedPowerChange;
  const fairnessBonus = fairExchange ? 20 : 0;
  const winWinBonus = bothImprove ? 40 : 0;
  const bothUpgradeBonus = bothHaveUpgrades ? 50 : 0;

  const score = (
    combinedPowerGain * 10 +
    positionalFitScore +
    fairnessBonus +
    winWinBonus +
    bothUpgradeBonus +
    lineupBonus1 +
    lineupBonus2 +
    starterUpgradeBonus
  );

  return {
    ...trade,
    team1Name: team1.teamName,
    team2Name: team2.teamName,
    team1Impact,
    team2Impact,
    bothImprove,
    bothHaveUpgrades,
    fairExchange,
    score: Math.round(score * 10) / 10,
    combinedPowerGain: Math.round(combinedPowerGain * 10) / 10
  };
}

/**
 * Find all mutually beneficial trades between two teams
 */
function findMutuallyBeneficialTrades(team1, team2, powerRankings, league) {
  const team1Needs = analyzeTeamNeeds(team1, powerRankings, league);
  const team2Needs = analyzeTeamNeeds(team2, powerRankings, league);

  // Generate potential trades
  const potentialTrades = generateTradeCombinations(team1Needs, team2Needs);

  // Score each trade
  const scoredTrades = potentialTrades.map(trade =>
    scoreTradeRecommendation(trade, team1, team2, team1Needs, team2Needs, powerRankings)
  );

  // Filter and sort trades - prioritize win-win but also include fair trades
  const sortedTrades = scoredTrades
    .filter(t => t.score > 0) // Must have positive overall score
    .sort((a, b) => {
      // Prioritize both-improve trades
      if (a.bothImprove && !b.bothImprove) return -1;
      if (!a.bothImprove && b.bothImprove) return 1;
      // Then by score
      return b.score - a.score;
    });

  return {
    team1: {
      name: team1.teamName,
      rosterId: team1.rosterId,
      needs: team1Needs
    },
    team2: {
      name: team2.teamName,
      rosterId: team2.rosterId,
      needs: team2Needs
    },
    recommendations: sortedTrades.slice(0, 10) // Top 10 trades
  };
}

/**
 * Find best trade partners for a single team
 */
function findBestTradePartners(targetTeam, allTeams, powerRankings, league) {
  const results = [];

  allTeams.forEach(otherTeam => {
    if (otherTeam.rosterId === targetTeam.rosterId) return;

    const analysis = findMutuallyBeneficialTrades(targetTeam, otherTeam, powerRankings, league);

    if (analysis.recommendations.length > 0) {
      results.push({
        partner: otherTeam.teamName,
        partnerId: otherTeam.rosterId,
        topTrade: analysis.recommendations[0],
        totalOptions: analysis.recommendations.length
      });
    }
  });

  // Sort by best trade score
  results.sort((a, b) => b.topTrade.score - a.topTrade.score);

  return results;
}

/**
 * Format trade recommendation for display
 */
function formatTradeRecommendation(trade) {
  const lines = [];

  lines.push(`\n${'─'.repeat(60)}`);
  lines.push(`TRADE RECOMMENDATION (Score: ${trade.score})`);
  lines.push(`${'─'.repeat(60)}`);
  lines.push(`Type: ${trade.type} | ${trade.positionSwap}`);
  lines.push('');

  // Team 1 side
  lines.push(`📤 ${trade.team1Name} gives:`);
  trade.team1Gives.forEach(p => {
    const starterTag = p.isStarter ? ' ⭐STARTER' : '';
    lines.push(`   • ${p.name} (${p.position}, ${p.team}) - Value: ${p.value.toLocaleString()}${starterTag}`);
  });

  lines.push(`📥 ${trade.team1Name} receives:`);
  trade.team2Gives.forEach(p => {
    lines.push(`   • ${p.name} (${p.position}, ${p.team}) - Value: ${p.value.toLocaleString()}`);
  });

  if (trade.team1Impact.starterUpgrades?.length > 0) {
    lines.push(`   🔺 Lineup upgrades:`);
    trade.team1Impact.starterUpgrades.forEach(u => {
      lines.push(`      ${u.newPlayer} replaces ${u.replaces} (+${u.improvement} value)`);
    });
  }
  lines.push('');

  // Team 2 side
  lines.push(`📤 ${trade.team2Name} gives:`);
  trade.team2Gives.forEach(p => {
    const starterTag = p.isStarter ? ' ⭐STARTER' : '';
    lines.push(`   • ${p.name} (${p.position}, ${p.team}) - Value: ${p.value.toLocaleString()}${starterTag}`);
  });

  lines.push(`📥 ${trade.team2Name} receives:`);
  trade.team1Gives.forEach(p => {
    lines.push(`   • ${p.name} (${p.position}, ${p.team}) - Value: ${p.value.toLocaleString()}`);
  });

  if (trade.team2Impact.starterUpgrades?.length > 0) {
    lines.push(`   🔺 Lineup upgrades:`);
    trade.team2Impact.starterUpgrades.forEach(u => {
      lines.push(`      ${u.newPlayer} replaces ${u.replaces} (+${u.improvement} value)`);
    });
  }
  lines.push('');

  // Summary badges
  if (trade.bothHaveUpgrades) {
    lines.push(`🏆 WIN-WIN: Both teams get starter upgrades!`);
  } else if (trade.bothImprove) {
    lines.push(`✅ MUTUAL BENEFIT: Both teams improve their lineup`);
  }
  if (trade.fairExchange) {
    lines.push(`⚖️ FAIR: Value exchange is balanced`);
  }

  return lines.join('\n');
}

/**
 * Format team needs analysis
 */
function formatTeamNeeds(teamName, needs) {
  const lines = [];

  lines.push(`\n📊 ${teamName} Position Analysis:`);

  ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
    const analysis = needs[pos];
    const status = analysis.isNeed ? '🔴 NEED' : analysis.isSurplus ? '🟢 SURPLUS' : '🟡 OK';

    lines.push(`   ${pos}: ${status} (Score: ${analysis.needScore})`);
    lines.push(`      Starters: ${analysis.starters.map(p => `${p.name} (${p.value})`).join(', ') || 'None'}`);
    if (analysis.bench.length > 0) {
      lines.push(`      Bench: ${analysis.bench.map(p => `${p.name} (${p.value})`).join(', ')}`);
    }
  });

  return lines.join('\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 Trade Recommendation Engine');
  console.log('==============================\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let targetTeam = null;
  let team1Name = null;
  let team2Name = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--team' && args[i + 1]) {
      targetTeam = args[i + 1];
      i++;
    } else if (args[i] === '--teams' && args[i + 1] && args[i + 2]) {
      team1Name = args[i + 1];
      team2Name = args[i + 2];
      i += 2;
    }
  }

  // Load data
  console.log('📊 Loading data...');
  const { powerRankings, players } = await loadData();
  console.log(`✅ Loaded ${powerRankings.rankings.length} teams\n`);

  // Build team objects
  const allTeams = Object.keys(powerRankings.rosters).map(rid =>
    getTeamRoster(rid, powerRankings, players)
  ).filter(t => t !== null);

  const league = powerRankings.league;

  if (team1Name && team2Name) {
    // Analyze specific pair of teams
    const team1 = allTeams.find(t => t.teamName.toLowerCase().includes(team1Name.toLowerCase()));
    const team2 = allTeams.find(t => t.teamName.toLowerCase().includes(team2Name.toLowerCase()));

    if (!team1) {
      console.error(`❌ Team not found: ${team1Name}`);
      process.exit(1);
    }
    if (!team2) {
      console.error(`❌ Team not found: ${team2Name}`);
      process.exit(1);
    }

    console.log(`🔍 Analyzing trades between ${team1.teamName} and ${team2.teamName}...\n`);

    const analysis = findMutuallyBeneficialTrades(team1, team2, powerRankings, league);

    // Show needs analysis
    console.log(formatTeamNeeds(team1.teamName, analysis.team1.needs));
    console.log(formatTeamNeeds(team2.teamName, analysis.team2.needs));

    if (analysis.recommendations.length === 0) {
      console.log('\n❌ No mutually beneficial trades found between these teams.');
      console.log('   This could mean:');
      console.log('   • Both teams have similar positional needs');
      console.log('   • Value mismatch between tradeable assets');
      console.log('   • Neither team has clear surplus positions');
    } else {
      console.log(`\n✅ Found ${analysis.recommendations.length} potential trades:`);
      analysis.recommendations.slice(0, 5).forEach(trade => {
        console.log(formatTradeRecommendation(trade));
      });
    }

  } else if (targetTeam) {
    // Find best trade partners for a specific team
    const team = allTeams.find(t => t.teamName.toLowerCase().includes(targetTeam.toLowerCase()));

    if (!team) {
      console.error(`❌ Team not found: ${targetTeam}`);
      console.log('Available teams:');
      allTeams.forEach(t => console.log(`  • ${t.teamName}`));
      process.exit(1);
    }

    console.log(`🔍 Finding best trade partners for ${team.teamName}...\n`);

    const teamNeeds = analyzeTeamNeeds(team, powerRankings, league);
    console.log(formatTeamNeeds(team.teamName, teamNeeds));

    const partners = findBestTradePartners(team, allTeams, powerRankings, league);

    if (partners.length === 0) {
      console.log('\n❌ No mutually beneficial trades found with any team.');
    } else {
      console.log(`\n🤝 Best Trade Partners:`);
      partners.slice(0, 5).forEach((partner, i) => {
        console.log(`\n${i + 1}. ${partner.partner} (${partner.totalOptions} options)`);
        console.log(formatTradeRecommendation(partner.topTrade));
      });
    }

  } else {
    // Find all league-wide trade opportunities
    console.log('🔍 Scanning all teams for trade opportunities...\n');

    const allRecommendations = [];

    for (let i = 0; i < allTeams.length; i++) {
      for (let j = i + 1; j < allTeams.length; j++) {
        const analysis = findMutuallyBeneficialTrades(allTeams[i], allTeams[j], powerRankings, league);
        if (analysis.recommendations.length > 0) {
          allRecommendations.push(...analysis.recommendations);
        }
      }
    }

    // Sort by score and show top recommendations
    allRecommendations.sort((a, b) => b.score - a.score);

    if (allRecommendations.length === 0) {
      console.log('❌ No mutually beneficial trades found in the league.');
    } else {
      console.log(`✅ Found ${allRecommendations.length} potential trades across the league!\n`);
      console.log('Top 10 Trade Recommendations:');

      allRecommendations.slice(0, 10).forEach((trade, i) => {
        console.log(`\n#${i + 1}`);
        console.log(formatTradeRecommendation(trade));
      });
    }

    // Save to file
    const outputDir = join(__dirname, 'trade-recommendations');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const output = {
      generatedAt: new Date().toISOString(),
      league: league.name,
      recommendations: allRecommendations.slice(0, 50).map(trade => ({
        team1: trade.team1Name,
        team2: trade.team2Name,
        team1Gives: trade.team1Gives.map(p => ({ name: p.name, position: p.position, value: p.value })),
        team2Gives: trade.team2Gives.map(p => ({ name: p.name, position: p.position, value: p.value })),
        team1Impact: trade.team1Impact,
        team2Impact: trade.team2Impact,
        type: trade.type,
        positionSwap: trade.positionSwap,
        score: trade.score,
        combinedPowerGain: trade.combinedPowerGain,
        bothImprove: trade.bothImprove,
        fairExchange: trade.fairExchange
      }))
    };

    const outputPath = join(outputDir, 'recommendations.json');
    writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n📁 Saved recommendations to ${outputPath}`);
  }

  console.log('\n✨ Done!');
}

// Run
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
