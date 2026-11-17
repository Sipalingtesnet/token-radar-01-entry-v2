# Token Radar 01 — Protocol Launch & Farm Radar

[![Token Radar 01 Badge](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/Sipalingtesnet/token-radar-01-entry-v2/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/Sipalingtesnet/token-radar-01-entry-v2/reward.svg)](https://make.fun/bounty/token-radar-01)

An advanced token launch radar and airdrop farming planner built for [make.fun token-radar-01 bounty](https://make.fun/bounty/token-radar-01).

## Model Summary
The implied value of each pre-token protocol is calculated directly from DefiLlama snapshot metrics:
- **Base Value**: Protocol TVL multiplied by a dynamically calibrated base multiple (trimmed mean of live token protocols' mcap/TVL ratio).
- **Growth Factor**: 7-day TVL change percentage clamped between -60% and +150%.
- **Age Factor**: Protocol maturity based on tracking history (listed date vs as_of date).
- **Chain Factor**: Multi-chain reach bonus.
- **Category Factor**: Median category growth multiplier.
- **Confidence Factor**: Data completeness tier (High, Medium, Low).

Implied values are capped at $20,000,000,000 and rounded to whole US dollars. Every protocol is paired with a concrete 6-step farm plan with explicit costs and execution times.

## How to Run
```bash
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /home/hatch/workspace/makefun/token-radar-01-kit/input/snapshot.json
```
