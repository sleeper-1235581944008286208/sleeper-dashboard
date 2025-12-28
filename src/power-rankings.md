# Power Rankings

```js
import * as Plot from "npm:@observablehq/plot";
import * as d3 from "npm:d3";

// Load data
const powerData = await FileAttachment("data/power-rankings.json").json();
const rankings = powerData.rankings;
const leagueInfo = powerData.league;
const playerValues = powerData.playerValues;
const rosterData = powerData.rosters;
const maxLineupValue = powerData.maxLineupValue;
```

<div style="margin: 0 0 3rem 0;">
  <div style="display: inline-block; padding: 0.5rem 1.25rem; background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 2rem; font-size: 0.875rem; font-weight: 600; color: #8b5cf6; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1.5rem;">
    Roster-Based Team Strength
  </div>
  <h1 style="margin: 0 0 1rem 0;">Power Rankings</h1>
  <p style="font-size: 1.125rem; color: #cbd5e1; margin: 0; max-width: 900px; line-height: 1.6;">
    Team strength rankings based on <strong>optimal starting lineup value</strong>, actual performance, and positional advantages.
    Unlike simple trade calculators, this accounts for <strong>roster constraints</strong> — 5 mediocre players don't equal 1 star when you can only start so many.
  </p>
</div>

## How Power Rankings Work

<div style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(109, 40, 217, 0.05) 100%); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 1rem; padding: 2rem; margin: 2rem 0;">
  <div style="display: flex; align-items: start; gap: 1.5rem;">
    <div style="font-size: 3rem; line-height: 1;">⚡</div>
    <div>
      <h3 style="margin-top: 0; color: #8b5cf6;">The Power Score Formula</h3>
      <p style="color: #cbd5e1; line-height: 1.7; margin: 0 0 1rem 0;">
        Power Score combines what your roster <strong>could do</strong> with what it <strong>has done</strong>:
      </p>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
        <div style="background: rgba(139, 92, 246, 0.1); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #8b5cf6;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #8b5cf6;">50%</div>
          <div style="font-weight: 600; color: #f8fafc;">Optimal Lineup Value</div>
          <div style="font-size: 0.875rem; color: #94a3b8;">Best possible starters using dynasty trade values</div>
        </div>
        <div style="background: rgba(34, 197, 94, 0.1); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #22c55e;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #22c55e;">30%</div>
          <div style="font-weight: 600; color: #f8fafc;">Actual Performance</div>
          <div style="font-size: 0.875rem; color: #94a3b8;">Win %, All-Play record, points scored</div>
        </div>
        <div style="background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #3b82f6;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #3b82f6;">15%</div>
          <div style="font-weight: 600; color: #f8fafc;">Positional Edge</div>
          <div style="font-size: 0.875rem; color: #94a3b8;">Elite players at scarce positions (RB, TE)</div>
        </div>
        <div style="background: rgba(249, 115, 22, 0.1); padding: 1rem; border-radius: 0.5rem; border-left: 3px solid #f97316;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #f97316;">5%</div>
          <div style="font-weight: 600; color: #f8fafc;">Usable Depth</div>
          <div style="font-size: 0.875rem; color: #94a3b8;">Meaningful backups only (top backup per position)</div>
        </div>
      </div>
    </div>
  </div>
</div>

```js
// Simulate trend by comparing lineup value rank to actual standing
// Positive trend = roster stronger than record suggests
const displayRankings = rankings.map(team => {
  // Calculate a simulated "previous" rank based on lineup vs performance difference
  const lineupRank = [...rankings].sort((a, b) => b.lineupValueScore - a.lineupValueScore)
    .findIndex(t => t.rosterId === team.rosterId) + 1;
  const perfRank = [...rankings].sort((a, b) => b.performanceScore - a.performanceScore)
    .findIndex(t => t.rosterId === team.rosterId) + 1;

  // Trend based on if roster value suggests they should be ranked higher/lower
  const expectedRank = Math.round((lineupRank * 0.6) + (perfRank * 0.4));
  const trendValue = expectedRank - team.powerRank;

  let trend, trendColor;
  if (trendValue > 1) {
    trend = "▲";
    trendColor = "#22c55e";
  } else if (trendValue < -1) {
    trend = "▼";
    trendColor = "#ef4444";
  } else {
    trend = "—";
    trendColor = "#94a3b8";
  }

  return {
    ...team,
    trend,
    trendColor,
    trendValue
  };
});
```

## Current Power Rankings

<div class="grid grid-3" style="margin: 2rem 0 3rem 0;">
  <div class="kpi-card">
    <div class="kpi-label">Top Power Team</div>
    <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin: 0.5rem 0;">
      ${rankings[0].teamName}
    </div>
    <div style="font-size: 0.875rem; color: #8b5cf6;">
      Power Score: ${rankings[0].powerScore}
    </div>
  </div>

  <div class="kpi-card">
    <div class="kpi-label">League Format</div>
    <div class="kpi-value" style="font-size: 1.75rem;">${leagueInfo.isSuperFlex ? 'Superflex' : '1QB'}</div>
    <div style="font-size: 0.875rem; color: #94a3b8;">
      ${leagueInfo.totalTeams} teams
    </div>
  </div>

  <div class="kpi-card">
    <div class="kpi-label">Power Gap</div>
    <div class="kpi-value" style="font-size: 2rem;">${(rankings[0].powerScore - rankings[rankings.length - 1].powerScore).toFixed(1)}</div>
    <div style="font-size: 0.875rem; color: #94a3b8;">
      #1 vs #${rankings.length} difference
    </div>
  </div>
</div>

```js
const rankingsTableContent = html`
  <div class="card">
    <h3 style="margin-top: 0;">Team Power Rankings</h3>
    <p style="color: #cbd5e1; margin-bottom: 1.5rem;">
      Teams ranked by composite Power Score. <strong>▲</strong> = roster suggests higher rank, <strong>▼</strong> = roster suggests lower rank.
    </p>
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
        <thead>
          <tr style="border-bottom: 2px solid rgba(139, 92, 246, 0.3);">
            <th style="padding: 0.75rem 0.5rem; text-align: center; color: #94a3b8; font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; width: 50px;">Rank</th>
            <th style="padding: 0.75rem 0.25rem; text-align: center; color: #94a3b8; font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; width: 30px;"></th>
            <th style="padding: 0.75rem 0.5rem; text-align: left; color: #94a3b8; font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;">Team</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center; color: #8b5cf6; font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; width: 70px;">Power</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center; color: #94a3b8; font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; width: 60px;">Lineup</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center; color: #94a3b8; font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; width: 55px;">Perf</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center; color: #94a3b8; font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; width: 50px;">Pos</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center; color: #94a3b8; font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; width: 55px;">Depth</th>
            <th style="padding: 0.75rem 0.5rem; text-align: center; color: #94a3b8; font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; width: 60px;">Record</th>
          </tr>
        </thead>
        <tbody>
          ${displayRankings.map((team, i) => html`
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); ${i % 2 === 0 ? 'background: rgba(139, 92, 246, 0.03);' : ''}">
              <td style="padding: 0.75rem 0.5rem; text-align: center; font-weight: 700; color: #f8fafc;">#${team.powerRank}</td>
              <td style="padding: 0.75rem 0.25rem; text-align: center; font-weight: 700; color: ${team.trendColor}; font-size: 1rem;">${team.trend}</td>
              <td style="padding: 0.75rem 0.5rem; text-align: left; color: #f8fafc; font-weight: 500;">${team.teamName}</td>
              <td style="padding: 0.75rem 0.5rem; text-align: center; font-weight: 700; color: #8b5cf6; font-size: 1rem;">${team.powerScore.toFixed(1)}</td>
              <td style="padding: 0.75rem 0.5rem; text-align: center; color: #cbd5e1;">${team.lineupValueScore.toFixed(1)}</td>
              <td style="padding: 0.75rem 0.5rem; text-align: center; color: #cbd5e1;">${team.performanceScore.toFixed(1)}</td>
              <td style="padding: 0.75rem 0.5rem; text-align: center; color: #cbd5e1;">${team.positionalScore.toFixed(1)}</td>
              <td style="padding: 0.75rem 0.5rem; text-align: center; color: #cbd5e1;">${team.depthScore.toFixed(1)}</td>
              <td style="padding: 0.75rem 0.5rem; text-align: center; color: #94a3b8; font-weight: 500;">${team.wins}-${team.losses}</td>
            </tr>
          `)}
        </tbody>
      </table>
    </div>
  </div>
`;

display(html`<details open class="section-collapse">
  <summary class="section-summary">Power Rankings Table</summary>
  <div class="section-content">
    ${rankingsTableContent}
  </div>
</details>`);
```

```js
const powerChartContent = html`
  <div class="chart-container">
    <h3 class="chart-title">Power Score Distribution</h3>
    ${Plot.plot({
      marginLeft: 140,
      marginBottom: 60,
      height: rankings.length * 50,
      x: {
        label: "Power Score →",
        grid: true,
        labelAnchor: "center",
        domain: [0, 100]
      },
      y: {
        label: null
      },
      color: {
        type: "linear",
        domain: [40, 80],
        range: ["#ef4444", "#8b5cf6"],
        legend: true,
        label: "Power Score"
      },
      marks: [
        Plot.barX(rankings, {
          x: "powerScore",
          y: "teamName",
          fill: "powerScore",
          sort: {y: "-x"},
          rx: 6
        }),
        Plot.text(rankings, {
          x: "powerScore",
          y: "teamName",
          text: d => `#${d.powerRank} • ${d.powerScore.toFixed(1)}`,
          dx: -10,
          fill: "#f8fafc",
          textAnchor: "end",
          fontSize: 11,
          fontWeight: 600
        }),
        Plot.ruleX([0])
      ]
    })}
  </div>
`;

display(html`<details open class="section-collapse">
  <summary class="section-summary">Power Score Visualization</summary>
  <div class="section-content">
    ${powerChartContent}
  </div>
</details>`);
```

## Trade Impact Simulator

<div style="background: linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(234, 88, 12, 0.05) 100%); border: 1px solid rgba(249, 115, 22, 0.3); border-radius: 1rem; padding: 1.5rem; margin: 1rem 0 2rem 0;">
  <div style="display: flex; align-items: center; gap: 1rem;">
    <div style="font-size: 2rem;">💡</div>
    <div>
      <h4 style="margin: 0; color: #f97316;">See the Real Impact</h4>
      <p style="margin: 0.5rem 0 0 0; color: #cbd5e1; font-size: 0.9375rem; line-height: 1.6;">
        Select two teams and pick players from each side to see how the trade affects <strong>starting lineup strength</strong>, not just total value.
      </p>
    </div>
  </div>
</div>

```js
// Team selectors for trade simulator
const teamASelector = Inputs.select(
  rankings.map(t => ({ value: t.rosterId, label: `${t.teamName} (#${t.powerRank})` })),
  { label: "Team 1", format: x => x.label }
);
const teamAId = Generators.input(teamASelector);

const teamBOptions = rankings.map(t => ({ value: t.rosterId, label: `${t.teamName} (#${t.powerRank})` }));
const teamBSelector = Inputs.select(
  teamBOptions,
  { label: "Team 2", format: x => x.label, value: teamBOptions[1] }
);
const teamBId = Generators.input(teamBSelector);
```

```js
// Get rosters for selected teams
const teamARoster = rosterData[teamAId.value];
const teamBRoster = rosterData[teamBId.value];
const teamAInfo = rankings.find(r => r.rosterId === teamAId.value);
const teamBInfo = rankings.find(r => r.rosterId === teamBId.value);

// Get players with values for each team
const teamAPlayers = (teamARoster?.players || [])
  .map(pid => ({ id: pid, ...playerValues[pid] }))
  .filter(p => p.name)
  .sort((a, b) => b.value - a.value);

const teamBPlayers = (teamBRoster?.players || [])
  .map(pid => ({ id: pid, ...playerValues[pid] }))
  .filter(p => p.name)
  .sort((a, b) => b.value - a.value);
```

```js
// Player selection - grouped by position for easier scanning
const posOrder = {QB: 1, RB: 2, WR: 3, TE: 4, K: 5, DEF: 6};
const teamAPlayersSorted = [...teamAPlayers].sort((a, b) => (posOrder[a.position] || 99) - (posOrder[b.position] || 99) || b.value - a.value);
const teamBPlayersSorted = [...teamBPlayers].sort((a, b) => (posOrder[a.position] || 99) - (posOrder[b.position] || 99) || b.value - a.value);

const teamAGivingSelector = Inputs.select(
  teamAPlayersSorted,
  {
    label: "Select players:",
    format: p => `[${p.position}] ${p.name} — ${p.value.toLocaleString()}`,
    multiple: true,
    size: 10
  }
);
const teamAGiving = Generators.input(teamAGivingSelector);

const teamBGivingSelector = Inputs.select(
  teamBPlayersSorted,
  {
    label: "Select players:",
    format: p => `[${p.position}] ${p.name} — ${p.value.toLocaleString()}`,
    multiple: true,
    size: 10
  }
);
const teamBGiving = Generators.input(teamBGivingSelector);
```

<div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; margin: 1rem 0; align-items: start;">
  <div class="card" style="border: 2px solid rgba(139, 92, 246, 0.3);">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <div>
        <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Team 1</div>
        <h4 style="margin: 0; color: #8b5cf6;">${teamARoster?.teamName || 'Team A'}</h4>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 0.75rem; color: #94a3b8;">Power Rank</div>
        <div style="font-size: 1.25rem; font-weight: 700; color: #f8fafc;">#${teamAInfo?.powerRank || '?'}</div>
      </div>
    </div>
    ${teamASelector}
    <div style="max-height: 300px; overflow-y: auto; margin-top: 1rem; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem;">
      ${teamAGivingSelector}
    </div>
    <div style="margin-top: 1rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 0.5rem;">
      <div style="font-size: 0.75rem; color: #ef4444; text-transform: uppercase; font-weight: 600;">Trading Away</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 0.25rem;">
        ${teamAGiving.reduce((sum, p) => sum + p.value, 0).toLocaleString()}
      </div>
      <div style="font-size: 0.875rem; color: #94a3b8;">${teamAGiving.length} player${teamAGiving.length !== 1 ? 's' : ''}</div>
    </div>
  </div>

  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem 1rem;">
    <div style="font-size: 2.5rem; color: #8b5cf6;">⇄</div>
    <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; margin-top: 0.5rem;">Trade</div>
  </div>

  <div class="card" style="border: 2px solid rgba(139, 92, 246, 0.3);">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <div>
        <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Team 2</div>
        <h4 style="margin: 0; color: #8b5cf6;">${teamBRoster?.teamName || 'Team B'}</h4>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 0.75rem; color: #94a3b8;">Power Rank</div>
        <div style="font-size: 1.25rem; font-weight: 700; color: #f8fafc;">#${teamBInfo?.powerRank || '?'}</div>
      </div>
    </div>
    ${teamBSelector}
    <div style="max-height: 300px; overflow-y: auto; margin-top: 1rem; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 0.5rem;">
      ${teamBGivingSelector}
    </div>
    <div style="margin-top: 1rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 0.5rem;">
      <div style="font-size: 0.75rem; color: #ef4444; text-transform: uppercase; font-weight: 600;">Trading Away</div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-top: 0.25rem;">
        ${teamBGiving.reduce((sum, p) => sum + p.value, 0).toLocaleString()}
      </div>
      <div style="font-size: 0.875rem; color: #94a3b8;">${teamBGiving.length} player${teamBGiving.length !== 1 ? 's' : ''}</div>
    </div>
  </div>
</div>

```js
// Calculate trade impact
function simulateTrade() {
  if (teamAGiving.length === 0 && teamBGiving.length === 0) {
    return null;
  }

  const teamABefore = rankings.find(r => r.rosterId === teamAId.value);
  const teamBBefore = rankings.find(r => r.rosterId === teamBId.value);

  // Simulate new rosters after trade
  const teamAGivingIds = new Set(teamAGiving.map(p => p.id));
  const teamBGivingIds = new Set(teamBGiving.map(p => p.id));

  // Team A: loses teamAGiving, gains teamBGiving
  const teamANewRoster = [
    ...teamARoster.players.filter(pid => !teamAGivingIds.has(pid)),
    ...teamBGiving.map(p => p.id)
  ];

  // Team B: loses teamBGiving, gains teamAGiving
  const teamBNewRoster = [
    ...teamBRoster.players.filter(pid => !teamBGivingIds.has(pid)),
    ...teamAGiving.map(p => p.id)
  ];

  // Calculate new lineup values (simplified - just sum optimal starters)
  function calculateNewLineupValue(playerIds) {
    const players = playerIds
      .map(pid => playerValues[pid])
      .filter(p => p)
      .sort((a, b) => b.value - a.value);

    // Simplified: take best 9 skill players (typical starting lineup)
    const starters = players.slice(0, 9);
    return starters.reduce((sum, p) => sum + p.value, 0);
  }

  const teamAOldLineup = calculateNewLineupValue(teamARoster.players);
  const teamANewLineup = calculateNewLineupValue(teamANewRoster);
  const teamBOldLineup = calculateNewLineupValue(teamBRoster.players);
  const teamBNewLineup = calculateNewLineupValue(teamBNewRoster);

  // Estimate new power scores (proportional change in lineup value component)
  const teamALineupChange = (teamANewLineup - teamAOldLineup) / maxLineupValue * 100 * 0.5;
  const teamBLineupChange = (teamBNewLineup - teamBOldLineup) / maxLineupValue * 100 * 0.5;

  return {
    teamA: {
      name: teamARoster.teamName,
      before: teamABefore,
      powerChange: teamALineupChange,
      newPowerScore: Math.round((teamABefore.powerScore + teamALineupChange) * 10) / 10,
      lineupChange: teamANewLineup - teamAOldLineup,
      gives: teamAGiving,
      receives: teamBGiving
    },
    teamB: {
      name: teamBRoster.teamName,
      before: teamBBefore,
      powerChange: teamBLineupChange,
      newPowerScore: Math.round((teamBBefore.powerScore + teamBLineupChange) * 10) / 10,
      lineupChange: teamBNewLineup - teamBOldLineup,
      gives: teamBGiving,
      receives: teamAGiving
    },
    totalValueA: teamAGiving.reduce((sum, p) => sum + p.value, 0),
    totalValueB: teamBGiving.reduce((sum, p) => sum + p.value, 0)
  };
}

const tradeImpact = simulateTrade();
```

```js
// Display trade impact results
if (tradeImpact) {
  const valueDiff = tradeImpact.totalValueB - tradeImpact.totalValueA;
  const isBalanced = Math.abs(valueDiff) < 1000;

  display(html`
    <div style="background: #1a1f29; border: 2px solid rgba(139, 92, 246, 0.4); border-radius: 1rem; padding: 2rem; margin: 2rem 0;">
      <h3 style="margin: 0 0 1.5rem 0; color: #8b5cf6; text-align: center;">Trade Impact Analysis</h3>

      <!-- Value comparison -->
      <div style="display: flex; justify-content: center; align-items: center; gap: 2rem; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <div style="text-align: center;">
          <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Total Value Given</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc;">${tradeImpact.totalValueA.toLocaleString()}</div>
          <div style="font-size: 0.875rem; color: #94a3b8;">${tradeImpact.teamA.name}</div>
        </div>
        <div style="font-size: 2rem; color: #94a3b8;">⇄</div>
        <div style="text-align: center;">
          <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Total Value Given</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #f8fafc;">${tradeImpact.totalValueB.toLocaleString()}</div>
          <div style="font-size: 0.875rem; color: #94a3b8;">${tradeImpact.teamB.name}</div>
        </div>
      </div>

      <!-- Power score changes -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
        <div style="background: rgba(139, 92, 246, 0.1); padding: 1.5rem; border-radius: 0.75rem; border: 1px solid rgba(139, 92, 246, 0.2);">
          <h4 style="margin: 0 0 1rem 0; color: #8b5cf6;">${tradeImpact.teamA.name}</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
              <div style="font-size: 0.75rem; color: #94a3b8;">Current Rank</div>
              <div style="font-size: 1.25rem; font-weight: 700; color: #f8fafc;">#${tradeImpact.teamA.before.powerRank}</div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: #94a3b8;">Power Score</div>
              <div style="font-size: 1.25rem; font-weight: 700; color: #f8fafc;">${tradeImpact.teamA.before.powerScore}</div>
            </div>
          </div>
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(139, 92, 246, 0.2);">
            <div style="font-size: 0.75rem; color: #94a3b8;">After Trade</div>
            <div style="display: flex; align-items: baseline; gap: 0.5rem;">
              <span style="font-size: 1.5rem; font-weight: 700; color: ${tradeImpact.teamA.powerChange >= 0 ? '#22c55e' : '#ef4444'};">
                ${tradeImpact.teamA.newPowerScore}
              </span>
              <span style="font-size: 1rem; color: ${tradeImpact.teamA.powerChange >= 0 ? '#22c55e' : '#ef4444'};">
                (${tradeImpact.teamA.powerChange >= 0 ? '+' : ''}${tradeImpact.teamA.powerChange.toFixed(1)})
              </span>
            </div>
          </div>
        </div>

        <div style="background: rgba(139, 92, 246, 0.1); padding: 1.5rem; border-radius: 0.75rem; border: 1px solid rgba(139, 92, 246, 0.2);">
          <h4 style="margin: 0 0 1rem 0; color: #8b5cf6;">${tradeImpact.teamB.name}</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
              <div style="font-size: 0.75rem; color: #94a3b8;">Current Rank</div>
              <div style="font-size: 1.25rem; font-weight: 700; color: #f8fafc;">#${tradeImpact.teamB.before.powerRank}</div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: #94a3b8;">Power Score</div>
              <div style="font-size: 1.25rem; font-weight: 700; color: #f8fafc;">${tradeImpact.teamB.before.powerScore}</div>
            </div>
          </div>
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(139, 92, 246, 0.2);">
            <div style="font-size: 0.75rem; color: #94a3b8;">After Trade</div>
            <div style="display: flex; align-items: baseline; gap: 0.5rem;">
              <span style="font-size: 1.5rem; font-weight: 700; color: ${tradeImpact.teamB.powerChange >= 0 ? '#22c55e' : '#ef4444'};">
                ${tradeImpact.teamB.newPowerScore}
              </span>
              <span style="font-size: 1rem; color: ${tradeImpact.teamB.powerChange >= 0 ? '#22c55e' : '#ef4444'};">
                (${tradeImpact.teamB.powerChange >= 0 ? '+' : ''}${tradeImpact.teamB.powerChange.toFixed(1)})
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Warning/Analysis -->
      ${(() => {
        const warnings = [];

        // Check if one team gains much more than the other
        if (Math.abs(tradeImpact.teamA.powerChange - tradeImpact.teamB.powerChange) > 3) {
          const winner = tradeImpact.teamA.powerChange > tradeImpact.teamB.powerChange ? tradeImpact.teamA.name : tradeImpact.teamB.name;
          const loser = tradeImpact.teamA.powerChange > tradeImpact.teamB.powerChange ? tradeImpact.teamB.name : tradeImpact.teamA.name;
          warnings.push({
            type: 'warning',
            message: `${winner} gains significantly more Power Score than ${loser}. This trade may be unbalanced.`
          });
        }

        // Check for trading stud for depth
        const teamAStars = tradeImpact.teamA.gives.filter(p => p.value > 6000);
        const teamBBench = tradeImpact.teamA.receives.filter(p => p.value < 3000);
        if (teamAStars.length > 0 && teamBBench.length >= 2 && tradeImpact.teamA.powerChange < 0) {
          warnings.push({
            type: 'danger',
            message: `${tradeImpact.teamA.name} is trading star player(s) for bench depth. This hurts their starting lineup!`
          });
        }

        const teamBStars = tradeImpact.teamB.gives.filter(p => p.value > 6000);
        const teamABench = tradeImpact.teamB.receives.filter(p => p.value < 3000);
        if (teamBStars.length > 0 && teamABench.length >= 2 && tradeImpact.teamB.powerChange < 0) {
          warnings.push({
            type: 'danger',
            message: `${tradeImpact.teamB.name} is trading star player(s) for bench depth. This hurts their starting lineup!`
          });
        }

        if (warnings.length === 0 && Math.abs(tradeImpact.teamA.powerChange - tradeImpact.teamB.powerChange) < 2) {
          warnings.push({
            type: 'success',
            message: 'This trade appears relatively balanced in terms of Power Score impact.'
          });
        }

        return html`
          <div style="margin-top: 1.5rem;">
            ${warnings.map(w => html`
              <div style="padding: 1rem; border-radius: 0.5rem; margin-bottom: 0.5rem; background: ${w.type === 'danger' ? 'rgba(239, 68, 68, 0.1)' : w.type === 'warning' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(34, 197, 94, 0.1)'}; border: 1px solid ${w.type === 'danger' ? 'rgba(239, 68, 68, 0.3)' : w.type === 'warning' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(34, 197, 94, 0.3)'};">
                <span style="color: ${w.type === 'danger' ? '#ef4444' : w.type === 'warning' ? '#f97316' : '#22c55e'}; font-weight: 600;">
                  ${w.type === 'danger' ? '⚠️' : w.type === 'warning' ? '⚡' : '✓'} ${w.message}
                </span>
              </div>
            `)}
          </div>
        `;
      })()}
    </div>
  `);
} else {
  display(html`
    <div style="padding: 2rem; text-align: center; background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 0.75rem; margin: 2rem 0;">
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">👆</div>
      <p style="color: #cbd5e1; margin: 0;">Select players from each team above to simulate a trade</p>
    </div>
  `);
}
```

## Component Breakdown

```js
const componentData = rankings.flatMap(team => [
  { team: team.teamName, component: "Lineup Value (50%)", score: team.lineupValueScore * 0.5, raw: team.lineupValueScore },
  { team: team.teamName, component: "Performance (30%)", score: team.performanceScore * 0.3, raw: team.performanceScore },
  { team: team.teamName, component: "Positional (15%)", score: team.positionalScore * 0.15, raw: team.positionalScore },
  { team: team.teamName, component: "Depth (5%)", score: team.depthScore * 0.05, raw: team.depthScore }
]);

const componentColors = {
  "Lineup Value (50%)": "#8b5cf6",
  "Performance (30%)": "#22c55e",
  "Positional (15%)": "#3b82f6",
  "Depth (5%)": "#f97316"
};

const stackedChartContent = html`
  <div class="chart-container">
    <h3 class="chart-title">Power Score Components by Team</h3>
    <p style="color: #94a3b8; font-size: 0.875rem; margin-bottom: 1rem;">
      See how each team's Power Score breaks down across the four components.
    </p>
    ${Plot.plot({
      marginLeft: 140,
      marginBottom: 80,
      height: rankings.length * 45,
      x: {
        label: "Contribution to Power Score →",
        grid: true,
        domain: [0, 100]
      },
      y: {
        label: null
      },
      color: {
        domain: Object.keys(componentColors),
        range: Object.values(componentColors),
        legend: true
      },
      marks: [
        Plot.barX(componentData, Plot.stackX({
          x: "score",
          y: "team",
          fill: "component",
          sort: {y: "-x", reduce: "sum"},
          rx: 4
        })),
        Plot.ruleX([0])
      ]
    })}
  </div>
`;

display(html`<details open class="section-collapse">
  <summary class="section-summary">Component Breakdown</summary>
  <div class="section-content">
    ${stackedChartContent}
  </div>
</details>`);
```

## Team Deep Dive

```js
const teamSelector = Inputs.select(
  rankings.map(t => t.teamName),
  {
    label: "Select Team",
    value: rankings[0].teamName
  }
);
const selectedTeamName = Generators.input(teamSelector);
```

```js
const selectedTeam = rankings.find(t => t.teamName === selectedTeamName);

const teamDeepDiveContent = html`
  <div>
    ${teamSelector}
  </div>

  <div style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(109, 40, 217, 0.05) 100%); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 1rem; padding: 2rem; margin: 1.5rem 0;">
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
      <div>
        <h3 style="margin-top: 0; color: #8b5cf6;">Power Score: ${selectedTeam.powerScore}</h3>
        <div style="display: grid; gap: 1rem;">
          <div>
            <div style="font-size: 0.875rem; color: #94a3b8;">Power Rank</div>
            <div style="font-size: 1.75rem; font-weight: 700; color: #f8fafc;">#${selectedTeam.powerRank} of ${rankings.length}</div>
          </div>
          <div>
            <div style="font-size: 0.875rem; color: #94a3b8;">Total Roster Value</div>
            <div style="font-size: 1.75rem; font-weight: 700; color: #f8fafc;">${selectedTeam.totalRosterValue.toLocaleString()}</div>
          </div>
        </div>
      </div>
      <div>
        <h3 style="margin-top: 0; color: #22c55e;">Performance</h3>
        <div style="display: grid; gap: 1rem;">
          <div>
            <div style="font-size: 0.875rem; color: #94a3b8;">Record</div>
            <div style="font-size: 1.75rem; font-weight: 700; color: #f8fafc;">${selectedTeam.wins}-${selectedTeam.losses}</div>
          </div>
          <div>
            <div style="font-size: 0.875rem; color: #94a3b8;">All-Play Record</div>
            <div style="font-size: 1.75rem; font-weight: 700; color: #f8fafc;">${selectedTeam.allPlayWins}-${selectedTeam.allPlayLosses} (${selectedTeam.allPlayWinPct}%)</div>
          </div>
        </div>
      </div>
    </div>

    <div style="margin-top: 2rem; padding-top: 2rem; border-top: 1px solid rgba(139, 92, 246, 0.2);">
      <h4 style="margin-top: 0; color: #8b5cf6;">Component Scores</h4>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-top: 1rem;">
        <div style="text-align: center; padding: 1rem; background: rgba(139, 92, 246, 0.1); border-radius: 0.5rem;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #8b5cf6;">${selectedTeam.lineupValueScore}</div>
          <div style="font-size: 0.75rem; color: #94a3b8;">Lineup Value</div>
        </div>
        <div style="text-align: center; padding: 1rem; background: rgba(34, 197, 94, 0.1); border-radius: 0.5rem;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #22c55e;">${selectedTeam.performanceScore}</div>
          <div style="font-size: 0.75rem; color: #94a3b8;">Performance</div>
        </div>
        <div style="text-align: center; padding: 1rem; background: rgba(59, 130, 246, 0.1); border-radius: 0.5rem;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #3b82f6;">${selectedTeam.positionalScore}</div>
          <div style="font-size: 0.75rem; color: #94a3b8;">Positional Edge</div>
        </div>
        <div style="text-align: center; padding: 1rem; background: rgba(249, 115, 22, 0.1); border-radius: 0.5rem;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #f97316;">${selectedTeam.depthScore}</div>
          <div style="font-size: 0.75rem; color: #94a3b8;">Depth</div>
        </div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-top: 1.5rem;">
    <h4 style="margin-top: 0;">Optimal Starting Lineup</h4>
    <p style="color: #94a3b8; font-size: 0.875rem; margin-bottom: 1rem;">
      The best possible lineup based on dynasty trade values. This is what drives the Lineup Value score.
    </p>
    ${Inputs.table(selectedTeam.starters.sort((a, b) => b.value - a.value), {
      columns: ["slot", "name", "value"],
      header: {
        slot: "Position",
        name: "Player",
        value: "Trade Value"
      },
      format: {
        value: x => x.toLocaleString()
      },
      width: {
        slot: 100,
        name: 200,
        value: 100
      }
    })}
  </div>
`;

display(html`<details open class="section-collapse">
  <summary class="section-summary">Team Deep Dive</summary>
  <div class="section-content">
    ${teamDeepDiveContent}
  </div>
</details>`);
```

---

<div style="margin-top: 4rem; padding: 2rem; background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(109, 40, 217, 0.05) 100%); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 1rem;">
  <div style="text-align: center;">
    <div style="font-size: 2rem; margin-bottom: 1rem;">⚡</div>
    <h3 style="margin-top: 0; color: #8b5cf6;">About Power Rankings</h3>
    <p style="color: #cbd5e1; max-width: 800px; margin: 0 auto; line-height: 1.7;">
      Power Rankings help identify true team strength beyond win-loss records. They're especially useful for evaluating trades —
      <strong>trading a star player for multiple mediocre players might look fair on paper, but hurts your Power Score</strong>
      because you can only start so many players. The Optimal Lineup Value component specifically captures this.
    </p>
    <div style="margin-top: 1.5rem; font-size: 0.875rem; color: #94a3b8;">
      <strong>Data Source:</strong> Player values from <a href="https://github.com/dynastyprocess/data" target="_blank" style="color: #8b5cf6;">DynastyProcess.com</a> (open source, updated weekly)
    </div>
  </div>
</div>
