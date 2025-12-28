# Power Rankings

```js
import * as Plot from "npm:@observablehq/plot";
import * as d3 from "npm:d3";

// Load data
const powerData = await FileAttachment("data/power-rankings.json").json();
const rankings = powerData.rankings;
const leagueInfo = powerData.league;
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
// Prepare display data
const displayRankings = rankings.map(team => ({
  ...team,
  trend: "—" // Placeholder for weekly trend
}));
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
      Teams ranked by composite Power Score. Hover over component scores to understand each team's strengths.
    </p>
    ${Inputs.table(displayRankings, {
      columns: ["powerRank", "teamName", "powerScore", "lineupValueScore", "performanceScore", "positionalScore", "depthScore", "wins", "losses", "pointsFor"],
      header: {
        powerRank: "Rank",
        teamName: "Team",
        powerScore: "Power Score",
        lineupValueScore: "Lineup (50%)",
        performanceScore: "Perform (30%)",
        positionalScore: "Position (15%)",
        depthScore: "Depth (5%)",
        wins: "W",
        losses: "L",
        pointsFor: "Points"
      },
      format: {
        powerScore: x => html`<strong style="color: #8b5cf6;">${x.toFixed(1)}</strong>`,
        lineupValueScore: x => x.toFixed(1),
        performanceScore: x => x.toFixed(1),
        positionalScore: x => x.toFixed(1),
        depthScore: x => x.toFixed(1),
        pointsFor: x => x.toFixed(1)
      },
      width: {
        powerRank: 60,
        teamName: 140,
        powerScore: 100,
        lineupValueScore: 90,
        performanceScore: 100,
        positionalScore: 100,
        depthScore: 80,
        wins: 50,
        losses: 50,
        pointsFor: 80
      }
    })}
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
