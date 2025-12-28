# Sleeper Fantasy Analytics Dashboard

An advanced analytics dashboard for Sleeper fantasy football leagues built with Observable Framework.

## Features

- **League Overview**: Current standings, points distribution, and team performance metrics
- **Power Rankings**: Composite team strength scores based on roster value, performance, and depth
- **Player Analytics**: Deep dive into player performance, trends, and projections
- **Matchup Analysis**: Week-by-week matchup breakdowns with win probability predictions
- **All-Play Records**: Schedule-independent performance tracking
- **Draft Overview & Retrospective**: Draft analysis and pick value evaluation
- **Trade Retrospective**: Historical trade tracking with long-term outcome analysis
- **AI-Powered Trade Analysis**: Expert commentary with power score impact analysis
- **AI-Powered Weekly Summaries**: Automated weekly recaps with power rankings context
- **Atrocity Tracker**: Quantify and rank the worst lineup decisions with detailed scoring algorithm
- **Ring of Honor**: Celebrate league champions and top performers

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your environment variables:
```bash
cp .env.example .env
# Edit .env and add:
# - Your Sleeper League ID
# - Your Anthropic API key (for AI summaries)
# - Commentator region (optional: US, UK, or EUR)
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:3000`

## Finding Your League ID

Your Sleeper League ID can be found in your league URL:
```
https://sleeper.com/leagues/YOUR_LEAGUE_ID
```

## Building for Production

```bash
npm run build
```

The built site will be in the `dist/` directory, ready to deploy to any static hosting service.

## Data Sources

This dashboard uses the Sleeper API to fetch:
- League settings and metadata
- Team rosters and standings
- Player information and statistics
- Matchup history and results

Data is automatically cached and refreshed during development.

## AI-Powered Features

This dashboard includes AI-powered commentary using Claude with **region-based commentator personas**.

### Commentator Regions

Set the `COMMENTATOR_REGION` environment variable to change the style of commentary:

| Region | Weekly Summaries | Trade Analysis |
|--------|------------------|----------------|
| **US** (default) | Pat McAfee, Lee Corso, Stuart Scott, Scott Van Pelt, Rich Eisen, Dan Patrick | Mel Kiper Jr., Adam Schefter, Daniel Jeremiah, Todd McShay, Louis Riddick, Ian Rapoport |
| **UK** | Gary Lineker, Roy Keane, Jamie Carragher, Gary Neville, Micah Richards, Peter Crouch, Alex Scott, Alan Shearer | Gary Neville, Roy Keane, Jamie Carragher, Simon Jordan, Alan Shearer, Gary Lineker |
| **EUR** | Thierry Henry, Arsene Wenger, Rafael Benitez, Jurgen Klopp, Pep Guardiola, European Analyst | Arsene Wenger, Rafael Benitez, Thierry Henry, Jose Mourinho, Pep Guardiola, European Analyst |

```bash
# In your .env file
COMMENTATOR_REGION=UK
```

### Power Score Integration

Both AI features now include **Power Score** context:

- **Current Power Rankings**: Each team's power score, rank, and component scores
- **Trade Impact Analysis**: Estimated power score change from trades
- **Dynasty Value Exchange**: Net value gained/lost in trades

### 1. Trade Analysis with NFL Analyst Personas

Get expert commentary on every trade in your league's history:

**Generate analyses:**
```bash
npm run build
npm run generate-trade-analysis
```

Features:
- 6 distinct analyst personas per region
- Power score and trade impact analysis
- Dynasty value calculations
- Detailed player metrics (age curves, positional value, performance tracking)
- Team context evaluation (contender vs rebuilding)
- Draft pick valuation

See [TRADE_ANALYZER.md](TRADE_ANALYZER.md) for detailed documentation.

### 2. Weekly Matchup Summaries

Automated weekly recaps in the voice of famous sports commentators.

**Generate summaries:**
```bash
npm run build
npm run generate-summaries        # Generate all missing weeks
npm run generate-summary 7        # Generate specific week
```

Features:
- 6-8 commentator personas per region
- Power rankings comparison for each matchup
- Atrocity commentary and lineup decision roasts
- Dramatic storylines and rivalry angles

See [WEEKLY_SUMMARIES.md](WEEKLY_SUMMARIES.md) for detailed documentation.

### GitHub Actions Automation

Both features are automated via GitHub Actions workflows:

#### Weekly Summaries Workflow
- **Schedule**: Every Wednesday at 10 AM UTC (after Monday Night Football)
- **Manual trigger**: Select region and optionally specify a week
- **File**: `.github/workflows/weekly-summaries.yml`

#### Trade Analysis Workflow
- **Schedule**: Daily at 8 AM UTC
- **Manual trigger**: Select region
- **File**: `.github/workflows/trade-analysis.yml`

**Required Secrets:**
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `SLEEPER_LEAGUE_ID`: Your Sleeper league ID

**Optional Secrets:**
- `COMMENTATOR_REGION`: Default region for scheduled runs (US, UK, or EUR)

## Technology

Built with:
- [Observable Framework](https://observablehq.com/framework/) - Static site generator for data apps
- [Observable Plot](https://observablehq.com/plot/) - Visualization library
- [Sleeper API](https://docs.sleeper.com/) - Fantasy football data
- [Claude AI](https://www.anthropic.com/claude) - AI-powered commentary
- [DynastyProcess](https://github.com/dynastyprocess/data) - Dynasty player valuations

## Support This Project

If you find this dashboard useful for your league, consider supporting its development:

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/waaronmorris)

Your support helps cover:
- AI API costs for weekly summaries
- Ongoing development and new features
- Server and infrastructure costs

## Contributing

Contributions are welcome! Feel free to:
- Report bugs or issues
- Suggest new features or analytics
- Submit pull requests
- Share with your fantasy football leagues

## License

MIT License - feel free to use and modify for your own leagues!
