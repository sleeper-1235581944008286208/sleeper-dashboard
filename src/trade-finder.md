# Trade Finder

```js
import * as Plot from "npm:@observablehq/plot";
import * as d3 from "npm:d3";
```

```js
const tradeData = await FileAttachment("data/trade-recommendations.json").json();
const recommendations = tradeData.recommendations;
const teams = tradeData.teams;
const league = tradeData.league;
```

<div style="padding: 2rem; background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(59, 130, 246, 0.15)); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 1rem; margin-bottom: 2rem;">
  <h1 style="margin: 0 0 0.5rem 0; font-size: 2rem; color: var(--color-text-primary);">Trade Finder</h1>
  <p style="margin: 0; color: var(--color-text-secondary); font-size: 1.1rem;">
    Discover mutually beneficial trades that improve both teams using Power Score analysis
  </p>
</div>

```js
// Stats
const winWinTrades = recommendations.filter(t => t.bothHaveUpgrades).length;
const totalTrades = recommendations.length;
const teamsWithNeeds = teams.filter(t =>
  Object.values(t.needs).some(n => n.isNeed)
).length;
```

<div class="grid grid-3" style="margin-bottom: 2rem;">
  <div class="card" style="background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.3);">
    <h3 style="color: var(--color-text-muted); margin: 0; font-size: 0.85rem; text-transform: uppercase;">Win-Win Trades</h3>
    <div style="font-size: 2.5rem; font-weight: bold; color: #22c55e;">${winWinTrades}</div>
    <div style="color: var(--color-text-secondary); font-size: 0.9rem;">Both teams get starter upgrades</div>
  </div>
  <div class="card" style="background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.3);">
    <h3 style="color: var(--color-text-muted); margin: 0; font-size: 0.85rem; text-transform: uppercase;">Total Opportunities</h3>
    <div style="font-size: 2.5rem; font-weight: bold; color: #3b82f6;">${totalTrades}</div>
    <div style="color: var(--color-text-secondary); font-size: 0.9rem;">Fair value trade options</div>
  </div>
  <div class="card" style="background: rgba(249, 115, 22, 0.1); border-color: rgba(249, 115, 22, 0.3);">
    <h3 style="color: var(--color-text-muted); margin: 0; font-size: 0.85rem; text-transform: uppercase;">Teams with Needs</h3>
    <div style="font-size: 2.5rem; font-weight: bold; color: #f97316;">${teamsWithNeeds}</div>
    <div style="color: var(--color-text-secondary); font-size: 0.9rem;">Could benefit from trades</div>
  </div>
</div>

## Team Analysis

```js
const teamOptions = [
  { value: "all", label: "All Teams" },
  ...teams.map(t => ({ value: t.rosterId.toString(), label: t.teamName }))
];

const teamSelector = Inputs.select(teamOptions, {
  label: "Filter by Team",
  format: d => d.label,
  value: teamOptions[0]
});

const selectedTeam = Generators.input(teamSelector);
```

<div style="margin-bottom: 1.5rem;">
  ${teamSelector}
</div>

```js
// Filter recommendations based on selected team
const filteredRecs = selectedTeam.value === "all"
  ? recommendations
  : recommendations.filter(r =>
      r.team1Id.toString() === selectedTeam.value ||
      r.team2Id.toString() === selectedTeam.value
    );

// Get selected team's needs if specific team selected
const selectedTeamData = selectedTeam.value !== "all"
  ? teams.find(t => t.rosterId.toString() === selectedTeam.value)
  : null;
```

```js
// Display team needs if a specific team is selected
function renderTeamNeeds(team) {
  if (!team) return '';

  const positions = ['QB', 'RB', 'WR', 'TE'];

  return html`
    <div style="background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 1rem; padding: 1.5rem; margin-bottom: 2rem;">
      <h3 style="margin: 0 0 1rem 0; color: var(--color-text-primary);">${team.teamName} - Position Analysis</h3>
      <div class="grid grid-4">
        ${positions.map(pos => {
          const need = team.needs[pos];
          const status = need.isNeed ? '🔴 NEED' : need.isSurplus ? '🟢 SURPLUS' : '🟡 OK';
          const statusColor = need.isNeed ? '#ef4444' : need.isSurplus ? '#22c55e' : '#f59e0b';

          return html`
            <div class="card" style="background: rgba(0,0,0,0.2);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span style="font-weight: bold; font-size: 1.1rem;">${pos}</span>
                <span style="color: ${statusColor}; font-size: 0.85rem;">${status}</span>
              </div>
              <div style="color: var(--color-text-muted); font-size: 0.8rem;">
                Score: ${need.needScore}
              </div>
              <div style="margin-top: 0.5rem;">
                <div style="color: var(--color-text-secondary); font-size: 0.75rem;">
                  Starters: ${need.starters.map(p => p.name.split(' ').pop()).join(', ') || 'None'}
                </div>
                ${need.bench.length > 0 ? html`
                  <div style="color: var(--color-text-muted); font-size: 0.7rem; margin-top: 0.25rem;">
                    Bench: ${need.bench.slice(0, 3).map(p => p.name.split(' ').pop()).join(', ')}${need.bench.length > 3 ? '...' : ''}
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

display(renderTeamNeeds(selectedTeamData));
```

## Trade Recommendations

```js
const showOnlyWinWin = Inputs.toggle({label: "Show only Win-Win trades", value: false});
const winWinFilter = Generators.input(showOnlyWinWin);
```

<div style="margin-bottom: 1rem;">
  ${showOnlyWinWin}
</div>

```js
const displayRecs = winWinFilter
  ? filteredRecs.filter(r => r.bothHaveUpgrades)
  : filteredRecs;
```

```js
function renderTradeCard(trade, index) {
  const badges = [];
  if (trade.bothHaveUpgrades) badges.push({ text: 'WIN-WIN', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.2)' });
  else if (trade.bothImprove) badges.push({ text: 'MUTUAL BENEFIT', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)' });
  if (trade.fairExchange) badges.push({ text: 'FAIR VALUE', color: '#f59e0b', bg: 'rgba(249, 115, 22, 0.2)' });

  return html`
    <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 1rem; padding: 1.5rem; margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <div>
          <span style="color: var(--color-text-muted); font-size: 0.8rem;">#${index + 1}</span>
          <span style="margin-left: 0.5rem; color: var(--color-text-secondary); font-size: 0.85rem;">${trade.type} • ${trade.positionSwap}</span>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          ${badges.map(b => html`
            <span style="background: ${b.bg}; color: ${b.color}; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.75rem; font-weight: 600;">
              ${b.text}
            </span>
          `)}
        </div>
      </div>

      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem;">
        <!-- Team 1 Side -->
        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 0.75rem; padding: 1rem;">
          <div style="font-weight: 600; color: var(--color-text-primary); margin-bottom: 0.75rem;">${trade.team1Name}</div>

          <div style="margin-bottom: 0.75rem;">
            <div style="color: #ef4444; font-size: 0.8rem; font-weight: 500; margin-bottom: 0.25rem;">📤 GIVES:</div>
            ${trade.team1Gives.map(p => html`
              <div style="color: var(--color-text-secondary); font-size: 0.85rem; padding-left: 0.5rem;">
                ${p.name} <span style="color: var(--color-text-muted);">(${p.position})</span>
                <span style="color: var(--color-text-muted); font-size: 0.75rem;"> - ${p.value.toLocaleString()}</span>
                ${p.isStarter ? html`<span style="color: #f59e0b;"> ⭐</span>` : ''}
              </div>
            `)}
          </div>

          <div>
            <div style="color: #22c55e; font-size: 0.8rem; font-weight: 500; margin-bottom: 0.25rem;">📥 RECEIVES:</div>
            ${trade.team2Gives.map(p => html`
              <div style="color: var(--color-text-secondary); font-size: 0.85rem; padding-left: 0.5rem;">
                ${p.name} <span style="color: var(--color-text-muted);">(${p.position})</span>
                <span style="color: var(--color-text-muted); font-size: 0.75rem;"> - ${p.value.toLocaleString()}</span>
              </div>
            `)}
          </div>

          ${trade.team1Impact.starterUpgrades?.length > 0 ? html`
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.2);">
              <div style="color: #22c55e; font-size: 0.75rem; font-weight: 500;">🔺 LINEUP UPGRADES:</div>
              ${trade.team1Impact.starterUpgrades.map(u => html`
                <div style="color: var(--color-text-muted); font-size: 0.75rem; padding-left: 0.5rem;">
                  ${u.newPlayer.split(' ').pop()} replaces ${u.replaces.split(' ').pop()} (+${u.improvement})
                </div>
              `)}
            </div>
          ` : ''}
        </div>

        <!-- Team 2 Side -->
        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 0.75rem; padding: 1rem;">
          <div style="font-weight: 600; color: var(--color-text-primary); margin-bottom: 0.75rem;">${trade.team2Name}</div>

          <div style="margin-bottom: 0.75rem;">
            <div style="color: #ef4444; font-size: 0.8rem; font-weight: 500; margin-bottom: 0.25rem;">📤 GIVES:</div>
            ${trade.team2Gives.map(p => html`
              <div style="color: var(--color-text-secondary); font-size: 0.85rem; padding-left: 0.5rem;">
                ${p.name} <span style="color: var(--color-text-muted);">(${p.position})</span>
                <span style="color: var(--color-text-muted); font-size: 0.75rem;"> - ${p.value.toLocaleString()}</span>
                ${p.isStarter ? html`<span style="color: #f59e0b;"> ⭐</span>` : ''}
              </div>
            `)}
          </div>

          <div>
            <div style="color: #22c55e; font-size: 0.8rem; font-weight: 500; margin-bottom: 0.25rem;">📥 RECEIVES:</div>
            ${trade.team1Gives.map(p => html`
              <div style="color: var(--color-text-secondary); font-size: 0.85rem; padding-left: 0.5rem;">
                ${p.name} <span style="color: var(--color-text-muted);">(${p.position})</span>
                <span style="color: var(--color-text-muted); font-size: 0.75rem;"> - ${p.value.toLocaleString()}</span>
              </div>
            `)}
          </div>

          ${trade.team2Impact.starterUpgrades?.length > 0 ? html`
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.2);">
              <div style="color: #22c55e; font-size: 0.75rem; font-weight: 500;">🔺 LINEUP UPGRADES:</div>
              ${trade.team2Impact.starterUpgrades.map(u => html`
                <div style="color: var(--color-text-muted); font-size: 0.75rem; padding-left: 0.5rem;">
                  ${u.newPlayer.split(' ').pop()} replaces ${u.replaces.split(' ').pop()} (+${u.improvement})
                </div>
              `)}
            </div>
          ` : ''}
        </div>
      </div>

      <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(148, 163, 184, 0.1); display: flex; justify-content: space-between; color: var(--color-text-muted); font-size: 0.8rem;">
        <span>Trade Score: <strong style="color: var(--color-text-primary);">${trade.score}</strong></span>
        <span>Value Exchange: ${trade.team1Impact.valueGiven.toLocaleString()} ↔ ${trade.team2Impact.valueGiven.toLocaleString()}</span>
      </div>
    </div>
  `;
}

display(html`
  <div>
    ${displayRecs.length === 0
      ? html`<div style="text-align: center; padding: 2rem; color: var(--color-text-muted);">No trade recommendations found for the selected filters.</div>`
      : displayRecs.slice(0, 20).map((trade, i) => renderTradeCard(trade, i))
    }
    ${displayRecs.length > 20 ? html`
      <div style="text-align: center; padding: 1rem; color: var(--color-text-muted);">
        Showing top 20 of ${displayRecs.length} recommendations
      </div>
    ` : ''}
  </div>
`);
```

## Position Needs Overview

```js
const needsData = [];
teams.forEach(team => {
  ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
    const need = team.needs[pos];
    needsData.push({
      team: team.teamName,
      position: pos,
      needScore: need.needScore,
      status: need.isNeed ? 'Need' : need.isSurplus ? 'Surplus' : 'OK'
    });
  });
});
```

```js
display(
  Plot.plot({
    title: "Team Position Needs Heatmap",
    marginLeft: 120,
    marginBottom: 40,
    height: teams.length * 35 + 80,
    x: { label: null, domain: ['QB', 'RB', 'WR', 'TE'] },
    y: { label: null },
    color: {
      type: "diverging",
      domain: [-50, 0, 50],
      range: ["#ef4444", "#fbbf24", "#22c55e"],
      legend: true,
      label: "Need Score (negative = need, positive = surplus)"
    },
    marks: [
      Plot.cell(needsData, {
        x: "position",
        y: "team",
        fill: "needScore",
        tip: true,
        title: d => `${d.team}\n${d.position}: ${d.status}\nScore: ${d.needScore}`
      }),
      Plot.text(needsData, {
        x: "position",
        y: "team",
        text: d => d.status === 'Need' ? '🔴' : d.status === 'Surplus' ? '🟢' : '🟡',
        fontSize: 14
      })
    ]
  })
);
```

<div style="margin-top: 2rem; padding: 1rem; background: rgba(148, 163, 184, 0.1); border-radius: 0.5rem; color: var(--color-text-muted); font-size: 0.85rem;">
  <strong>How it works:</strong> The Trade Finder analyzes each team's roster to identify positional needs and surpluses.
  It then matches teams with complementary needs to find trades where both sides benefit.
  Win-Win trades are those where both teams receive players who would immediately upgrade their starting lineup.
  <br><br>
  <strong>Last updated:</strong> ${new Date(tradeData.lastUpdated).toLocaleString()}
</div>
