import type { DashboardRow, FundingRate } from '../types';

// ─── API Endpoints ───────────────────────────────────────────────────────────
const LIGHTER_API_URL = 'https://mainnet.zklighter.elliot.ai/api/v1/funding-rates';
const VARIATIONAL_API_URL = 'https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats';
const BINANCE_PREMIUM_INDEX_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex';
const BINANCE_FUNDING_INFO_URL = 'https://fapi.binance.com/fapi/v1/fundingInfo';
const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz/info';

// ─── Constants ───────────────────────────────────────────────────────────────
const STANDARD_INTERVAL_HOURS = 8;
const INTERVALS_PER_YEAR = 1095; // 365 * 3 (three 8-hour intervals per day)

// Exchanges fetched directly (skip from Lighter fallback to avoid duplicates)
const DIRECT_EXCHANGES = new Set(['binance', 'hyperliquid']);
// Exchanges to skip entirely (unreliable data)
const EXCLUDED_EXCHANGES = new Set(['bybit']);

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

/** Strip common quote suffixes (USDT, USD) and uppercase the symbol. */
const normalizeSymbol = (raw: string): string => {
    let s = raw.toUpperCase();
    if (s.endsWith('USDT')) return s.slice(0, -4);
    if (s.endsWith('USD')) return s.slice(0, -3);
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
): Promise<void> {
    const [premiumResp, infoResp] = await Promise.all([
        fetch(BINANCE_PREMIUM_INDEX_URL),
        fetch(BINANCE_FUNDING_INFO_URL),
    ]);

    if (!premiumResp.ok || !infoResp.ok) return;

    const premiumJson: BinancePremiumIndex[] = await premiumResp.json();
    const infoJson: BinanceFundingInfo[] = await infoResp.json();

    // Build a lookup from raw symbol → interval hours
    const intervalMap = new Map<string, number>();
    for (const info of infoJson) {
        intervalMap.set(info.symbol, info.fundingIntervalHours);
    }

    const exchange = 'binance';
    exchangesSet.add(exchange);

    for (const item of premiumJson) {
        const symbol = normalizeSymbol(item.symbol);
        ensureRow(combinedData, symbol);

        const interval = intervalMap.get(item.symbol) ?? STANDARD_INTERVAL_HOURS;
        // Scale rate to 8-hour equivalent (e.g. 4h rate × 2)
        const rate8h = parseFloat(item.lastFundingRate) * (STANDARD_INTERVAL_HOURS / interval);
        combinedData[symbol][exchange] = rate8h;
    }
}

async function fetchHyperliquid(
    combinedData: Record<string, DashboardRow>,
    exchangesSet: Set<string>,
): Promise<void> {
    const response = await fetch(HYPERLIQUID_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (!response.ok) return;

    const [meta, assetCtxs]: HyperliquidResponse = await response.json();
    const exchange = 'hyperliquid';
    exchangesSet.add(exchange);

    meta.universe.forEach((asset, index) => {
        const ctx = assetCtxs[index];
        if (!ctx?.funding) return;

        const symbol = asset.name.toUpperCase();
        ensureRow(combinedData, symbol);

        // Hyperliquid funding rate is 1-hour; convert to 8-hour equivalent
        combinedData[symbol][exchange] = parseFloat(ctx.funding) * STANDARD_INTERVAL_HOURS;
    });
}

async function fetchLighter(
    combinedData: Record<string, DashboardRow>,
    exchangesSet: Set<string>,
): Promise<void> {
    const response = await fetch(LIGHTER_API_URL);
    if (!response.ok) throw new Error('Failed to fetch Lighter rates');

    const json: LighterResponse = await response.json();
    if (!json.funding_rates) return;

    for (const item of json.funding_rates) {
        const exchange = item.exchange.toLowerCase();

        // Skip exchanges fetched directly or explicitly excluded
        if (DIRECT_EXCHANGES.has(exchange) || EXCLUDED_EXCHANGES.has(exchange)) continue;

        const symbol = item.symbol.toUpperCase();
        exchangesSet.add(exchange);
        ensureRow(combinedData, symbol);
        combinedData[symbol][exchange] = item.rate;
    }
}

async function fetchVariational(
    combinedData: Record<string, DashboardRow>,
    exchangesSet: Set<string>,
): Promise<void> {
    const response = await fetch(VARIATIONAL_API_URL);
    if (!response.ok) {
        console.warn('Variational API returned status:', response.status);
        return;
    }

    const json: VariationalResponse = await response.json();
    const exchange = 'variational';
    exchangesSet.add(exchange);

    for (const asset of json.listings) {
        if (!asset.funding_rate) continue;

        const symbol = asset.ticker.toUpperCase();
        const rawRate = parseFloat(asset.funding_rate);

        // Variational funding_rate is annualized APR → convert to 8-hour rate
        ensureRow(combinedData, symbol);
        combinedData[symbol][exchange] = rawRate / INTERVALS_PER_YEAR;
    }
}

// ─── Main Fetch Orchestrator ─────────────────────────────────────────────────

export const fetchFundingRates = async (): Promise<{
    data: DashboardRow[];
    exchanges: string[];
}> => {
    const combinedData: Record<string, DashboardRow> = {};
    const exchangesSet = new Set<string>();

    // Fire all exchange fetchers in parallel for maximum speed
    const results = await Promise.allSettled([
        fetchBinance(combinedData, exchangesSet),
        fetchHyperliquid(combinedData, exchangesSet),
        fetchLighter(combinedData, exchangesSet),
        fetchVariational(combinedData, exchangesSet),
    ]);

    // Log any failures (non-fatal – other exchanges still available)
    results.forEach((result, i) => {
        if (result.status === 'rejected') {
            const names = ['Binance', 'Hyperliquid', 'Lighter', 'Variational'];
            console.error(`Error fetching ${names[i]}:`, result.reason);
        }
    });

    return {
        data: Object.values(combinedData),
        exchanges: Array.from(exchangesSet).sort(),
    };
};
