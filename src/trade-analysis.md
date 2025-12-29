<div style="margin: 0 0 2rem 0;">
  <div style="display: inline-block; padding: 0.5rem 1.25rem; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 2rem; font-size: 0.875rem; font-weight: 600; color: #22c55e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1.5rem;">
    Trade Analysis
  </div>
  <h1 style="margin: 0 0 1rem 0; font-size: 2.5rem; font-weight: 800; line-height: 1.1; background: linear-gradient(135deg, #f8fafc 0%, #22c55e 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
    AI-Powered Trade Commentary
  </h1>
  <p style="font-size: 1.125rem; color: #cbd5e1; margin: 0; max-width: 800px; line-height: 1.6;">
    Expert analysis of every trade in your league history, featuring commentary from legendary NFL analysts. See trades through the eyes of the best in the business.
  </p>
</div>

```js
// Load data
const tradeAnalyses = await FileAttachment("data/trade-analysis.json").json();
const trades = await FileAttachment("data/trades.json").json();
const players = await FileAttachment("data/players.json").json();
const rosters = await FileAttachment("data/rosters.json").json();
const users = await FileAttachment("data/users.json").json();

// Load power rankings data for trade impact
let powerData = null;
try {
  powerData = await FileAttachment("data/power-rankings.json").json();
} catch (e) {
  console.log("Power rankings data not available");
}
const playerValues = powerData?.playerValues || {};
const powerRankings = powerData?.rankings || [];
```

```js
// Helper to get player name
function getPlayerName(playerId) {
  const player = players[playerId];
  if (!player) return playerId;
  return `${player.first_name} ${player.last_name}`;
}

// Helper to get user by roster ID
function getUserByRosterId(rosterId) {
  const roster = rosters.find(r => r.roster_id === rosterId);
  if (!roster) return null;
  return users.find(u => u.user_id === roster.owner_id);
}

// Calculate trade value impact
function calculateTradeImpact(trade) {
  if (!trade || !playerValues || Object.keys(playerValues).length === 0) return null;

  const rosterIds = new Set([
    ...Object.values(trade.adds || {}),
    ...Object.values(trade.drops || {})
  ]);

  const impacts = {};

  Array.from(rosterIds).forEach(rosterId => {
    const user = getUserByRosterId(rosterId);
    const userName = user?.display_name || `Team ${rosterId}`;

    let valueReceived = 0;
    let valueGiven = 0;
    const playersReceived = [];
    const playersGiven = [];

    if (trade.adds) {
      Object.entries(trade.adds).forEach(([playerId, rId]) => {
        if (rId === rosterId) {
          const pv = playerValues[playerId];
          if (pv) {
            valueReceived += pv.value;
            playersReceived.push({ name: pv.name, value: pv.value, position: pv.position });
          }
        }
      });
    }

    if (trade.drops) {
      Object.entries(trade.drops).forEach(([playerId, rId]) => {
        if (rId === rosterId) {
          const pv = playerValues[playerId];
          if (pv) {
            valueGiven += pv.value;
            playersGiven.push({ name: pv.name, value: pv.value, position: pv.position });
          }
        }
      });
    }

    const netValue = valueReceived - valueGiven;
    impacts[rosterId] = {
      userName,
      valueReceived,
      valueGiven,
      netValue,
      playersReceived,
      playersGiven,
      isWinner: netValue > 500,
      isLoser: netValue < -500
    };
  });

  return impacts;
}

// Match analyses to trade details
const enrichedAnalyses = tradeAnalyses.map(analysis => {
  const trade = trades.find(t => {
    return analysis.participants.every(participantName => {
      const rosterIds = new Set([
        ...Object.values(t.adds || {}),
        ...Object.values(t.drops || {})
      ]);
      return Array.from(rosterIds).some(rosterId => {
        const user = getUserByRosterId(rosterId);
        return user?.display_name === participantName;
      });
    }) && t.week === analysis.week && t.season === analysis.season;
  });

  const tradeImpact = calculateTradeImpact(trade);

  return {
    ...analysis,
    trade,
    tradeImpact
  };
});

// Filter options
const allSeasons = [...new Set(enrichedAnalyses.map(a => a.season))].sort((a, b) => b.localeCompare(a));
const allPersonas = [...new Set(enrichedAnalyses.map(a => a.persona))].sort();
const allManagers = [...new Set(enrichedAnalyses.flatMap(a => a.participants))].sort();
```

```js
// Summary Stats
const totalTrades = enrichedAnalyses.length;
const tradesBySeason = Object.fromEntries(
  allSeasons.map(s => [s, enrichedAnalyses.filter(a => a.season === s).length])
);
const totalWins = enrichedAnalyses.reduce((sum, a) => {
  if (!a.tradeImpact) return sum;
  return sum + Object.values(a.tradeImpact).filter(i => i.isWinner).length;
}, 0);
```

<!-- Summary Stats Cards -->
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
  <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.1) 100%); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 0.75rem; padding: 1.25rem; text-align: center;">
    <div style="font-size: 2rem; font-weight: 800; color: #22c55e;">${totalTrades}</div>
    <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Total Trades</div>
  </div>
  <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.1) 100%); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 0.75rem; padding: 1.25rem; text-align: center;">
    <div style="font-size: 2rem; font-weight: 800; color: #3b82f6;">${allSeasons.length}</div>
    <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Seasons</div>
  </div>
  <div style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(168, 85, 247, 0.1) 100%); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 0.75rem; padding: 1.25rem; text-align: center;">
    <div style="font-size: 2rem; font-weight: 800; color: #a855f7;">${allPersonas.length}</div>
    <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Analysts</div>
  </div>
  <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.1) 100%); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 0.75rem; padding: 1.25rem; text-align: center;">
    <div style="font-size: 2rem; font-weight: 800; color: #f59e0b;">${allManagers.length}</div>
    <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Managers</div>
  </div>
</div>

<!-- Filter Bar -->
<div style="background: #1a1f29; border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 2rem;">
  <div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: end;">

```js
const searchInput = view(Inputs.text({
  label: "Search",
  placeholder: "Player, manager, or keyword...",
  width: 280,
  value: ""
}));
```

```js
const selectedSeason = view(Inputs.select(
  ["All Seasons", ...allSeasons],
  { label: "Season", value: "All Seasons" }
));
```

```js
const selectedPersona = view(Inputs.select(
  ["All Analysts", ...allPersonas],
  { label: "Analyst", value: "All Analysts" }
));
```

```js
const selectedManager = view(Inputs.select(
  ["All Managers", ...allManagers],
  { label: "Manager", value: "All Managers" }
));
```

```js
const sortOption = view(Inputs.select(
  ["Newest First", "Oldest First", "Biggest Wins", "Biggest Losses", "Most Lopsided", "Highest Value"],
  { label: "Sort By", value: "Newest First" }
));
```

  </div>
</div>

```js
// Apply filters
let filteredAnalyses = enrichedAnalyses;

// Search filter
if (searchInput && searchInput.trim().length > 0) {
  const query = searchInput.toLowerCase().trim();
  filteredAnalyses = filteredAnalyses.filter(a => {
    // Search in participants
    const participantMatch = a.participants.some(p => p.toLowerCase().includes(query));
    // Search in analysis text
    const analysisMatch = a.analysis.toLowerCase().includes(query);
    // Search in player names from sides
    const playerMatch = a.sides?.some(side =>
      [...(side.receives || []), ...(side.gives || [])].some(p =>
        p.name?.toLowerCase().includes(query)
      )
    );
    return participantMatch || analysisMatch || playerMatch;
  });
}

// Season filter
if (selectedSeason !== "All Seasons") {
  filteredAnalyses = filteredAnalyses.filter(a => a.season === selectedSeason);
}

// Persona filter
if (selectedPersona !== "All Analysts") {
  filteredAnalyses = filteredAnalyses.filter(a => a.persona === selectedPersona);
}

// Manager filter
if (selectedManager !== "All Managers") {
  filteredAnalyses = filteredAnalyses.filter(a => a.participants.includes(selectedManager));
}

// Helper to get max net value from a trade (for sorting)
function getMaxNetValue(analysis) {
  if (!analysis.tradeImpact) return 0;
  return Math.max(...Object.values(analysis.tradeImpact).map(i => i.netValue || 0));
}

function getMinNetValue(analysis) {
  if (!analysis.tradeImpact) return 0;
  return Math.min(...Object.values(analysis.tradeImpact).map(i => i.netValue || 0));
}

function getLopsidedValue(analysis) {
  if (!analysis.tradeImpact) return 0;
  const values = Object.values(analysis.tradeImpact).map(i => i.netValue || 0);
  return Math.abs(Math.max(...values) - Math.min(...values));
}

function getTotalValue(analysis) {
  if (!analysis.tradeImpact) return 0;
  return Object.values(analysis.tradeImpact).reduce((sum, i) => sum + (i.valueReceived || 0), 0);
}

// Apply sorting
switch (sortOption) {
  case "Newest First":
    filteredAnalyses = filteredAnalyses.sort((a, b) => {
      if (b.season !== a.season) return b.season.localeCompare(a.season);
      return b.week - a.week;
    });
    break;
  case "Oldest First":
    filteredAnalyses = filteredAnalyses.sort((a, b) => {
      if (a.season !== b.season) return a.season.localeCompare(b.season);
      return a.week - b.week;
    });
    break;
  case "Biggest Wins":
    filteredAnalyses = filteredAnalyses.sort((a, b) => getMaxNetValue(b) - getMaxNetValue(a));
    break;
  case "Biggest Losses":
    filteredAnalyses = filteredAnalyses.sort((a, b) => getMinNetValue(a) - getMinNetValue(b));
    break;
  case "Most Lopsided":
    filteredAnalyses = filteredAnalyses.sort((a, b) => getLopsidedValue(b) - getLopsidedValue(a));
    break;
  case "Highest Value":
    filteredAnalyses = filteredAnalyses.sort((a, b) => getTotalValue(b) - getTotalValue(a));
    break;
}

// Pagination
const PAGE_SIZE = 5;
const totalPages = Math.max(1, Math.ceil(filteredAnalyses.length / PAGE_SIZE));
```

```js
const currentPage = view(Inputs.range([1, totalPages], {
  step: 1,
  value: 1,
  width: 150
}));
```

```js
const startIndex = (currentPage - 1) * PAGE_SIZE;
const endIndex = Math.min(startIndex + PAGE_SIZE, filteredAnalyses.length);
const paginatedAnalyses = filteredAnalyses.slice(startIndex, endIndex);
```

<!-- Pagination Info -->
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding: 0.75rem 1rem; background: rgba(148, 163, 184, 0.05); border-radius: 0.5rem;">
  <div style="color: #94a3b8; font-size: 0.875rem;">
    Showing <span style="color: #f8fafc; font-weight: 600;">${startIndex + 1}-${endIndex}</span> of <span style="color: #f8fafc; font-weight: 600;">${filteredAnalyses.length}</span> trades
  </div>
  <div style="display: flex; align-items: center; gap: 0.75rem;">
    <span style="color: #64748b; font-size: 0.875rem;">Page ${currentPage} of ${totalPages}</span>
  </div>
</div>

```js
// Display analyses
if (tradeAnalyses.length === 0) {
  display(html`
    <div style="padding: 3rem; text-align: center; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 0.75rem; margin: 2rem 0;">
      <div style="font-size: 3rem; margin-bottom: 1rem;">📊</div>
      <h3 style="margin: 0 0 0.5rem 0; color: #22c55e;">No Trade Analyses Yet</h3>
      <p style="color: #cbd5e1; margin: 0 0 1.5rem 0;">Generate AI-powered trade commentary to see expert analysis here.</p>
      <div style="background: #1a1f29; padding: 1rem; border-radius: 0.5rem; font-family: monospace; font-size: 0.875rem; text-align: left; max-width: 500px; margin: 0 auto;">
        <code style="color: #22c55e;">node src/data/generate-trade-analysis.js</code>
      </div>
    </div>
  `);
} else if (filteredAnalyses.length === 0) {
  display(html`
    <div style="padding: 3rem; text-align: center; background: rgba(148, 163, 184, 0.05); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 0.75rem;">
      <div style="font-size: 2.5rem; margin-bottom: 1rem;">🔍</div>
      <h3 style="margin: 0 0 0.5rem 0; color: #f8fafc;">No Matches Found</h3>
      <p style="color: #94a3b8; margin: 0;">Try adjusting your search or filters</p>
    </div>
  `);
} else {
  paginatedAnalyses.forEach((analysis) => {
    // Determine winner/loser for styling
    let hasWinner = false;
    let hasLoser = false;
    if (analysis.tradeImpact) {
      hasWinner = Object.values(analysis.tradeImpact).some(i => i.isWinner);
      hasLoser = Object.values(analysis.tradeImpact).some(i => i.isLoser);
    }

    display(html`
      <div style="margin-bottom: 1.5rem; background: #1a1f29; border: 1px solid rgba(34, 197, 94, 0.15); border-radius: 0.75rem; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);">

        <!-- Trade Header -->
        <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%); padding: 1rem 1.5rem; border-bottom: 1px solid rgba(34, 197, 94, 0.15);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <div style="font-size: 0.6875rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.1em; margin-bottom: 0.25rem;">
                ${analysis.season} Season • Week ${analysis.week}
              </div>
              <div style="font-size: 1.25rem; font-weight: 700; color: #f8fafc;">
                ${analysis.participants.join(' ⇄ ')}
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              ${hasWinner && hasLoser ? html`
                <span style="padding: 0.25rem 0.75rem; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 1rem; font-size: 0.6875rem; font-weight: 600; color: #f59e0b; text-transform: uppercase;">
                  Lopsided
                </span>
              ` : ''}
              <span style="padding: 0.25rem 0.75rem; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 1rem; font-size: 0.6875rem; font-weight: 600; color: #22c55e;">
                ${analysis.persona}
              </span>
            </div>
          </div>
        </div>

        <!-- Trade Details -->
        ${analysis.sides ? html`
          <div style="padding: 1rem 1.5rem; background: rgba(0, 0, 0, 0.15);">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
              ${analysis.sides.map(side => {
                const impact = side.tradeImpact;
                const isWinner = impact?.netValueChange > 500;
                const isLoser = impact?.netValueChange < -500;

                return html`
                  <div style="
                    padding: 1rem;
                    background: ${isWinner ? 'rgba(34, 197, 94, 0.1)' : isLoser ? 'rgba(239, 68, 68, 0.1)' : 'rgba(148, 163, 184, 0.05)'};
                    border: 1px solid ${isWinner ? 'rgba(34, 197, 94, 0.3)' : isLoser ? 'rgba(239, 68, 68, 0.3)' : 'rgba(148, 163, 184, 0.1)'};
                    border-radius: 0.5rem;
                  ">
                    <!-- Team Name & Status -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                      <div style="font-weight: 700; color: ${isWinner ? '#22c55e' : isLoser ? '#ef4444' : '#f8fafc'};">
                        ${side.teamName}
                      </div>
                      ${impact ? html`
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                          <span style="font-size: 0.75rem; font-weight: 700; color: ${impact.netValueChange > 0 ? '#22c55e' : impact.netValueChange < 0 ? '#ef4444' : '#94a3b8'};">
                            ${impact.netValueChange > 0 ? '+' : ''}${impact.netValueChange.toLocaleString()}
                          </span>
                          ${isWinner ? html`<span style="background: #22c55e; color: #000; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.625rem; font-weight: 800;">WIN</span>` : ''}
                          ${isLoser ? html`<span style="background: #ef4444; color: #fff; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.625rem; font-weight: 800;">LOSS</span>` : ''}
                        </div>
                      ` : ''}
                    </div>

                    <!-- Power Score & Context -->
                    ${side.powerScore ? html`
                      <div style="font-size: 0.6875rem; color: #64748b; margin-bottom: 0.75rem;">
                        Power Rank #${side.powerScore.powerRank} (${side.powerScore.powerScore}) • ${side.teamContext || ''}
                      </div>
                    ` : ''}

                    <!-- Receives -->
                    ${side.receives?.length > 0 ? html`
                      <div style="margin-bottom: 0.5rem;">
                        <div style="font-size: 0.6875rem; color: #22c55e; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Receives</div>
                        <div style="font-size: 0.8125rem; color: #cbd5e1;">
                          ${side.receives.map(a => a.position === 'PICK' ? a.name : `${a.name} (${a.position})`).join(', ')}
                        </div>
                        ${impact ? html`<div style="font-size: 0.6875rem; color: #22c55e; margin-top: 0.25rem;">+${impact.valueGained.toLocaleString()} value</div>` : ''}
                      </div>
                    ` : ''}

                    <!-- Gives -->
                    ${side.gives?.length > 0 ? html`
                      <div>
                        <div style="font-size: 0.6875rem; color: #ef4444; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Gives</div>
                        <div style="font-size: 0.8125rem; color: #cbd5e1;">
                          ${side.gives.map(a => a.position === 'PICK' ? a.name : `${a.name} (${a.position})`).join(', ')}
                        </div>
                        ${impact ? html`<div style="font-size: 0.6875rem; color: #ef4444; margin-top: 0.25rem;">-${impact.valueLost.toLocaleString()} value</div>` : ''}
                      </div>
                    ` : ''}
                  </div>
                `;
              })}
            </div>
          </div>
        ` : ''}

        <!-- Analysis -->
        <div style="padding: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
            <span style="font-size: 1.5rem;">🎙️</span>
            <span style="font-weight: 700; color: #22c55e;">${analysis.persona}'s Take</span>
          </div>
          <div style="color: #e2e8f0; line-height: 1.75; white-space: pre-wrap; font-size: 0.9375rem;">
${analysis.analysis}
          </div>
        </div>

        <!-- Footer -->
        <div style="padding: 0.75rem 1.5rem; background: rgba(0, 0, 0, 0.2); border-top: 1px solid rgba(148, 163, 184, 0.1);">
          <div style="font-size: 0.6875rem; color: #64748b;">
            Generated ${new Date(analysis.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>
    `);
  });
}
```

---

## Meet the Analysts

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 1.5rem;">

<div style="padding: 1.25rem; background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 0.75rem;">
  <h4 style="margin: 0 0 0.5rem 0; color: #22c55e; font-size: 1rem;">Mel Kiper Jr.</h4>
  <p style="margin: 0; font-size: 0.8125rem; color: #94a3b8; line-height: 1.5;">
    Draft expert with detailed player evaluations. Focuses on talent assessment, rankings, and player upside.
  </p>
</div>

<div style="padding: 1.25rem; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 0.75rem;">
  <h4 style="margin: 0 0 0.5rem 0; color: #3b82f6; font-size: 1rem;">Adam Schefter</h4>
  <p style="margin: 0; font-size: 0.8125rem; color: #94a3b8; line-height: 1.5;">
    NFL insider with breaking news style. Provides context, league implications, and behind-the-scenes perspective.
  </p>
</div>

<div style="padding: 1.25rem; background: linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 0.75rem;">
  <h4 style="margin: 0 0 0.5rem 0; color: #a855f7; font-size: 1rem;">Daniel Jeremiah</h4>
  <p style="margin: 0; font-size: 0.8125rem; color: #94a3b8; line-height: 1.5;">
    Former scout with analytical perspective. Evaluates through talent metrics, scheme fit, and production.
  </p>
</div>

<div style="padding: 1.25rem; background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 0.75rem;">
  <h4 style="margin: 0 0 0.5rem 0; color: #f59e0b; font-size: 1rem;">Todd McShay</h4>
  <p style="margin: 0; font-size: 0.8125rem; color: #94a3b8; line-height: 1.5;">
    Draft analyst focused on value and team needs. Evaluates roster construction and team-building strategy.
  </p>
</div>

<div style="padding: 1.25rem; background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 0.75rem;">
  <h4 style="margin: 0 0 0.5rem 0; color: #ef4444; font-size: 1rem;">Louis Riddick</h4>
  <p style="margin: 0; font-size: 0.8125rem; color: #94a3b8; line-height: 1.5;">
    Former GM with executive perspective. Analyzes asset management and championship windows.
  </p>
</div>

<div style="padding: 1.25rem; background: linear-gradient(135deg, rgba(20, 184, 166, 0.1) 0%, rgba(20, 184, 166, 0.05) 100%); border: 1px solid rgba(20, 184, 166, 0.2); border-radius: 0.75rem;">
  <h4 style="margin: 0 0 0.5rem 0; color: #14b8a6; font-size: 1rem;">Ian Rapoport</h4>
  <p style="margin: 0; font-size: 0.8125rem; color: #94a3b8; line-height: 1.5;">
    NFL insider with quick, punchy analysis. Provides insider context and future implications.
  </p>
</div>

</div>
