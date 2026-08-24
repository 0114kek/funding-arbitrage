import type { DashboardRow, ExchangeStatus, FetchFundingRatesResult, FundingRate } from '../types';

// ─── API Endpoints ───────────────────────────────────────────────────────────
const LIGHTER_API_URL = 'https://mainnet.zklighter.elliot.ai/api/v1/funding-rates';
const VARIATIONAL_API_URL = 'https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats';
const BINANCE_PREMIUM_INDEX_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex';
const BINANCE_FUNDING_INFO_URL = 'https://fapi.binance.com/fapi/v1/fundingInfo';
const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz/info';

// ─── Constants ───────────────────────────────────────────────────────────────
const STANDARD_INTERVAL_HOURS = 8;
const INTERVALS_PER_YEAR = 1095; // 365 * 3 (three 8-hour intervals per day)
const REQUEST_TIMEOUT_MS = 8000;

// Exchanges fetched directly (skip from Lighter fallback to avoid duplicates)
const DIRECT_EXCHANGES = new Set(['binance', 'hyperliquid']);
// Exchanges to skip entirely (Bybit is intentionally excluded)
const EXCLUDED_EXCHANGES = new Set(['bybit']);

// Known Hyperliquid 'k' prefixed tokens to normalize to base symbol
const KNOWN_K_PREFIXED_TOKENS = new Set([
  'KPEPE',
  'KSHIB',
  'KBONK',
  'KLUNC',
  'KFLOKI',
  'KDOGS',
  'KNEIRO',
  'KCAT',
  'KRATS',
]);

// ─── Response Types ──────────────────────────────────────────────────────────
interface LighterResponse {
  code: number;
  funding_rates: FundingRate[];
}

interface VariationalAsset {
  ticker: string;
  funding_rate: string;
  funding_interval_s: number;
}

interface VariationalResponse {
  listings: VariationalAsset[];
}

interface BinancePremiumIndex {
  symbol: string;
  lastFundingRate: string;
}

interface BinanceFundingInfo {
  symbol: string;
  fundingIntervalHours: number;
}

interface HyperliquidMeta {
  universe: { name: string }[];
}

interface HyperliquidAssetCtx {
  funding: string;
}

type HyperliquidResponse = [HyperliquidMeta, HyperliquidAssetCtx[]];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fetch with a configurable timeout using AbortController */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Standardize symbol across all exchanges:
 * - Strip quote currencies (USDT, USDC, USD, BUSD) and perp suffixes (-PERP, _PERP)
 * - Normalize meme coin multipliers (1000000x, 1000x, kX) to base token symbol
 */
export const normalizeSymbol = (raw: string): string => {
  let s = raw.toUpperCase().trim();

  // Strip delimiters and quote currencies
  s = s.replace(/[-_/]?(USDT|USDC|USD|BUSD|PERP)$/i, '');

  // Normalize multipliers
  if (s.startsWith('1000000')) {
    s = s.slice(7);
  } else if (s.startsWith('1000')) {
    s = s.slice(4);
  } else if (KNOWN_K_PREFIXED_TOKENS.has(s)) {
    s = s.slice(1);
  }

  return s;
};

/** Ensure a symbol key exists in the combined data map. */
const ensureRow = (map: Record<string, DashboardRow>, symbol: string): void => {
  if (!map[symbol]) {
    map[symbol] = { symbol };
  }
};

// ─── Individual Fetchers ─────────────────────────────────────────────────────

async function fetchBinance(
  combinedData: Record<string, DashboardRow>,
  exchangesSet: Set<string>,
): Promise<number> {
  const [premiumSettled, infoSettled] = await Promise.allSettled([
    fetchWithTimeout(BINANCE_PREMIUM_INDEX_URL),
    fetchWithTimeout(BINANCE_FUNDING_INFO_URL),
  ]);

  if (premiumSettled.status !== 'fulfilled' || !premiumSettled.value.ok) {
    throw new Error('Failed to fetch Binance premium index');
  }

  const premiumJson: BinancePremiumIndex[] = await premiumSettled.value.json();

  // Parse funding info if available, else fall back to 8h interval
  const intervalMap = new Map<string, number>();
  if (infoSettled.status === 'fulfilled' && infoSettled.value.ok) {
    try {
      const infoJson: BinanceFundingInfo[] = await infoSettled.value.json();
      for (const info of infoJson) {
        intervalMap.set(info.symbol, info.fundingIntervalHours);
      }
    } catch (e) {
      console.warn('Failed to parse Binance funding info, using default 8h interval', e);
    }
  }

  const exchange = 'binance';
  exchangesSet.add(exchange);
  let count = 0;

  for (const item of premiumJson) {
    const symbol = normalizeSymbol(item.symbol);
    if (!symbol) continue;
    ensureRow(combinedData, symbol);

    const interval = intervalMap.get(item.symbol) ?? STANDARD_INTERVAL_HOURS;
    // Scale rate to 8-hour equivalent (e.g. 4h rate × 2)
    const rate8h = parseFloat(item.lastFundingRate) * (STANDARD_INTERVAL_HOURS / interval);
    combinedData[symbol][exchange] = rate8h;
    count++;
  }

  return count;
}

async function fetchHyperliquid(
  combinedData: Record<string, DashboardRow>,
  exchangesSet: Set<string>,
): Promise<number> {
  const response = await fetchWithTimeout(HYPERLIQUID_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });
  if (!response.ok) throw new Error(`Hyperliquid returned status ${response.status}`);

  const [meta, assetCtxs]: HyperliquidResponse = await response.json();
  const exchange = 'hyperliquid';
  exchangesSet.add(exchange);
  let count = 0;

  for (let index = 0; index < meta.universe.length; index++) {
    const asset = meta.universe[index];
    const ctx = assetCtxs[index];
    if (!ctx?.funding) continue;

    const symbol = normalizeSymbol(asset.name);
    if (!symbol) continue;
    ensureRow(combinedData, symbol);

    // Hyperliquid funding rate is 1-hour; convert to 8-hour equivalent
    combinedData[symbol][exchange] = parseFloat(ctx.funding) * STANDARD_INTERVAL_HOURS;
    count++;
  }

  return count;
}

async function fetchLighter(
  combinedData: Record<string, DashboardRow>,
  exchangesSet: Set<string>,
): Promise<number> {
  const response = await fetchWithTimeout(LIGHTER_API_URL);
  if (!response.ok) throw new Error(`Lighter API returned status ${response.status}`);

  const json: LighterResponse = await response.json();
  if (!json.funding_rates) return 0;

  let count = 0;
  for (const item of json.funding_rates) {
    const exchange = item.exchange.toLowerCase();

    // Skip exchanges fetched directly or explicitly excluded (Bybit is excluded)
    if (DIRECT_EXCHANGES.has(exchange) || EXCLUDED_EXCHANGES.has(exchange)) continue;

    const symbol = normalizeSymbol(item.symbol);
    if (!symbol) continue;
    exchangesSet.add(exchange);
    ensureRow(combinedData, symbol);
    combinedData[symbol][exchange] = item.rate;
    count++;
  }

  return count;
}

async function fetchVariational(
  combinedData: Record<string, DashboardRow>,
  exchangesSet: Set<string>,
): Promise<number> {
  const response = await fetchWithTimeout(VARIATIONAL_API_URL);
  if (!response.ok) throw new Error(`Variational API returned status ${response.status}`);

  const json: VariationalResponse = await response.json();
  const exchange = 'variational';
  exchangesSet.add(exchange);
  let count = 0;

  for (const asset of json.listings) {
    if (!asset.funding_rate) continue;

    const symbol = normalizeSymbol(asset.ticker);
    if (!symbol) continue;
    const rawRate = parseFloat(asset.funding_rate);

    // Variational funding_rate is annualized APR → convert to 8-hour rate
    ensureRow(combinedData, symbol);
    combinedData[symbol][exchange] = rawRate / INTERVALS_PER_YEAR;
    count++;
  }

  return count;
}

// ─── Main Fetch Orchestrator ─────────────────────────────────────────────────

export const fetchFundingRates = async (): Promise<FetchFundingRatesResult> => {
  const combinedData: Record<string, DashboardRow> = {};
  const exchangesSet = new Set<string>();
  const statuses: Record<string, ExchangeStatus> = {
    binance: { name: 'Binance', status: 'loading', count: 0 },
    hyperliquid: { name: 'Hyperliquid', status: 'loading', count: 0 },
    lighter: { name: 'Lighter', status: 'loading', count: 0 },
    variational: { name: 'Variational', status: 'loading', count: 0 },
  };

  const now = new Date();

  // Fire all exchange fetchers in parallel for maximum speed
  const results = await Promise.allSettled([
    fetchBinance(combinedData, exchangesSet),
    fetchHyperliquid(combinedData, exchangesSet),
    fetchLighter(combinedData, exchangesSet),
    fetchVariational(combinedData, exchangesSet),
  ]);

  const exchangeKeys = ['binance', 'hyperliquid', 'lighter', 'variational'];

  results.forEach((result, i) => {
    const key = exchangeKeys[i];
    if (result.status === 'fulfilled') {
      statuses[key] = {
        name: statuses[key].name,
        status: 'online',
        count: result.value,
        lastUpdated: now,
      };
    } else {
      console.error(`Error fetching ${statuses[key].name}:`, result.reason);
      statuses[key] = {
        name: statuses[key].name,
        status: 'offline',
        count: 0,
        lastUpdated: now,
        error: result.reason instanceof Error ? result.reason.message : 'Fetch failed',
      };
    }
  });

  return {
    data: Object.values(combinedData),
    exchanges: Array.from(exchangesSet).sort(),
    exchangeStatuses: statuses,
  };
};

