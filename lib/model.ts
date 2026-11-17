// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
// Designed with a dynamic base multiple calibrated from live token protocols, age/growth/chain/category factors,
// and comprehensive farm plans.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_floor: number;
  growth_cap: number;
  unknown_age_days: number;
  max_implied_value: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25, // dynamic or fallback
  growth_floor: -60,
  growth_cap: 150,
  unknown_age_days: 365,
  max_implied_value: 20_000_000_000,
};

export const MODEL_VERSION = 'radar-v2-dynamic';

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_factor: number;
    age_factor: number;
    chain_factor: number;
    category_factor: number;
    confidence_factor: number;
    confidence_tier: 'High' | 'Medium' | 'Low';
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_factor: number;
  age_factor: number;
  chain_factor: number;
  category_factor: number;
  confidence_factor: number;
  confidence_tier: 'High' | 'Medium' | 'Low';
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_STAKED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGES = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  const cat = (p.category ?? '').toLowerCase();
  const excludedCats = ['cex', 'bridge', 'canonical bridge', 'liquid staking', 'liquid restaking', 'restaked btc'];
  if (excludedCats.includes(cat)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_STAKED.test(p.name)) return false;
  if (EXCHANGES.test(p.name)) return false;
  return true;
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

function computeBaseMultiple(protocols: SnapshotProtocol[]): number {
  const ratios: number[] = [];
  for (const p of protocols) {
    if (!isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.tvl_usd > 1_000_000) {
      const ratio = p.mcap_usd / p.tvl_usd;
      if (ratio > 0.01 && ratio < 50) {
        ratios.push(ratio);
      }
    }
  }
  if (ratios.length === 0) return 0.25;
  ratios.sort((a, b) => a - b);
  // trimmed mean (drop bottom 10% and top 10%)
  const trimCount = Math.floor(ratios.length * 0.1);
  const trimmed = ratios.slice(trimCount, ratios.length - trimCount);
  const sum = trimmed.reduce((acc, v) => acc + v, 0);
  const mean = sum / (trimmed.length || 1);
  return Math.max(0.05, Math.min(1.50, mean));
}

function computeCategoryMedians(protocols: SnapshotProtocol[]): Map<string, number> {
  const catChanges = new Map<string, number[]>();
  for (const p of protocols) {
    if (p.category && p.change_7d !== null) {
      const list = catChanges.get(p.category) || [];
      list.push(p.change_7d);
      catChanges.set(p.category, list);
    }
  }
  const catFactors = new Map<string, number>();
  for (const [cat, changes] of catChanges.entries()) {
    if (changes.length === 0) continue;
    changes.sort((a, b) => a - b);
    const median = changes[Math.floor(changes.length / 2)]!;
    // map median change (-20% to +30%) to factor 0.9 .. 1.15
    const clampedChange = Math.max(-30, Math.min(50, median));
    const factor = 1.0 + (clampedChange / 200);
    catFactors.set(cat, Math.max(0.9, Math.min(1.15, factor)));
  }
  return catFactors;
}

export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants, baseMultiple: number, categoryFactors: Map<string, number>): {
  implied: number;
  growthPct: number;
  growthFactor: number;
  ageFactor: number;
  chainFactor: number;
  categoryFactor: number;
  confidenceFactor: number;
  confidenceTier: 'High' | 'Medium' | 'Low';
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = typeof protocol.change_7d === 'number' && Number.isFinite(protocol.change_7d) ? protocol.change_7d : 0;
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthFactor = 1 + (growthPct / 200);

  const ageYears = (age ?? model.unknown_age_days) / 365.0;
  const ageFactor = 0.85 + 0.30 * Math.min(ageYears, 4) / 4.0;

  const chainCount = Math.max(1, protocol.chains.length);
  const chainFactor = 1 + 0.04 * Math.min(chainCount - 1, 4);

  const catFactor = protocol.category ? (categoryFactors.get(protocol.category) ?? 1.0) : 1.0;

  let confidenceFactor = 1.0;
  let confidenceTier: 'High' | 'Medium' | 'Low' = 'High';
  const hasChange = protocol.change_7d !== null;
  const hasListed = protocol.listed_at !== null;
  if (hasChange && hasListed) {
    confidenceFactor = 1.0;
    confidenceTier = 'High';
  } else if (hasChange || hasListed) {
    confidenceFactor = 0.95;
    confidenceTier = 'Medium';
  } else {
    confidenceFactor = 0.90;
    confidenceTier = 'Low';
  }

  const base = protocol.tvl_usd * baseMultiple;
  const rawImplied = base * growthFactor * ageFactor * chainFactor * catFactor * confidenceFactor;
  const implied = Math.max(1, Math.min(model.max_implied_value, Math.round(rawImplied)));

  return {
    implied,
    growthPct,
    growthFactor: round4(growthFactor),
    ageFactor: round4(ageFactor),
    chainFactor: round4(chainFactor),
    categoryFactor: round4(catFactor),
    confidenceFactor: round4(confidenceFactor),
    confidenceTier,
    age,
  };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const baseMultiple = computeBaseMultiple(snapshot.protocols);
  const categoryFactors = computeCategoryMedians(snapshot.protocols);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  // Add all other rankable protocols below floor or anywhere to reach a rich board (>= 100 rows, exactly target size)
  const candidates = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  for (const p of candidates) {
    chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const res = impliedValue(p, snapshot.as_of, model, baseMultiple, categoryFactors);
    return { p, ...res };
  });

  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: round4(baseMultiple),
      growth_pct: s.growthPct,
      growth_factor: s.growthFactor,
      age_factor: s.ageFactor,
      chain_factor: s.chainFactor,
      category_factor: s.categoryFactor,
      confidence_factor: s.confidenceFactor,
      confidence_tier: s.confidenceTier,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_factor: row.model.growth_factor,
    age_factor: row.model.age_factor,
    chain_factor: row.model.chain_factor,
    category_factor: row.model.category_factor,
    confidence_factor: row.model.confidence_factor,
    confidence_tier: row.model.confidence_tier,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
