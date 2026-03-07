import type { DashboardRow, FundingRate } from '../types';

const LIGHTER_API_URL = 'https://mainnet.zklighter.elliot.ai/api/v1/funding-rates';
const VARIATIONAL_API_URL = 'https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats';
const BINANCE_API_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex';
const HYPERLIQUID_API_URL = 'https://api.hyperliquid.xyz/info';

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

// Number of 8-hour intervals in a year: 365 * 3 = 1095
const INTERVALS_PER_YEAR = 1095;

export const fetchFundingRates = async (): Promise<{ data: DashboardRow[]; exchanges: string[] }> => {
    const combinedData: Record<string, DashboardRow> = {};
    const exchangesSet = new Set<string>();

    // 1. Fetch Binance Direct API
    try {
        const [premiumResp, infoResp] = await Promise.all([
            fetch(BINANCE_API_URL),
            fetch('https://fapi.binance.com/fapi/v1/fundingInfo')
        ]);

        if (premiumResp.ok && infoResp.ok) {
            const premiumJson: BinancePremiumIndex[] = await premiumResp.json();
            const infoJson: BinanceFundingInfo[] = await infoResp.json();

            const intervalMap: Record<string, number> = {};
            infoJson.forEach(info => {
                intervalMap[info.symbol] = info.fundingIntervalHours;
            });

            const exchange = 'binance';
            exchangesSet.add(exchange);

            premiumJson.forEach((item) => {
                const rawSymbol = item.symbol;
                let symbol = rawSymbol.toUpperCase();

                if (symbol.endsWith('USDT')) {
                    symbol = symbol.slice(0, -4);
                } else if (symbol.endsWith('USD')) {
                    symbol = symbol.slice(0, -3);
                }

                if (!combinedData[symbol]) {
                    combinedData[symbol] = { symbol };
                }

                const interval = intervalMap[rawSymbol] || 8;
                // Scale rate to 8-hour equivalent (e.g. 4h rate * 2)
                const rate8h = parseFloat(item.lastFundingRate) * (8 / interval);

                combinedData[symbol][exchange] = rate8h;
            });
        }
    } catch (error) {
        console.error('Error fetching Binance direct API:', error);
    }

    // 2. Fetch Hyperliquid Direct API
    try {
        const response = await fetch(HYPERLIQUID_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'metaAndAssetCtxs' })
        });
        if (response.ok) {
            const [meta, assetCtxs]: HyperliquidResponse = await response.json();
            const exchange = 'hyperliquid';
            exchangesSet.add(exchange);

            meta.universe.forEach((asset, index) => {
                const symbol = asset.name.toUpperCase();
                const ctx = assetCtxs[index];
                if (!ctx || !ctx.funding) return;

                // Hyperliquid funding rate is 1-hour rate, convert to 8-hour to match Binance
                const rate8h = parseFloat(ctx.funding) * 8;

                if (!combinedData[symbol]) {
                    combinedData[symbol] = { symbol };
                }
                combinedData[symbol][exchange] = rate8h;
            });
        }
    } catch (error) {
        console.error('Error fetching Hyperliquid direct API:', error);
    }

    // 3. Fetch Lighter API (as fallback for other exchanges)
    try {
        const response = await fetch(LIGHTER_API_URL);
        if (!response.ok) throw new Error('Failed to fetch Lighter rates');

        const json: LighterResponse = await response.json();

        if (json.funding_rates) {
            json.funding_rates.forEach((item) => {
                const symbol = item.symbol.toUpperCase();
                const exchange = item.exchange.toLowerCase(); // binance, lighter, ...
                if (exchange === 'bybit') { // bybit funding rate is not reliable
                    return;
                }
                if (exchange === 'binance' || exchange === 'hyperliquid') {
                    // Skip these as they are fetched directly
                    return;
                }
                exchangesSet.add(exchange);

                if (!combinedData[symbol]) {
                    combinedData[symbol] = { symbol };
                }
                combinedData[symbol][exchange] = item.rate;
            });
        }
    } catch (error) {
        console.error('Error fetching Lighter API:', error);
    }

    // 4. Fetch Variational API
    try {
        const response = await fetch(VARIATIONAL_API_URL);
        if (response.ok) {
            const json: VariationalResponse = await response.json();
            const exchange = 'variational';
            exchangesSet.add(exchange);

            json.listings.forEach((asset) => {
                if (!asset.funding_rate) return;

                const symbol = asset.ticker.toUpperCase();
                const rawRate = parseFloat(asset.funding_rate);

                // Variational funding_rate is annualized APR (e.g. 0.06 = 6%/year)
                // Convert to 8-hour rate: Annual Rate / 1095 (365 days * 3 intervals/day)
                const normalized8hRate = rawRate / INTERVALS_PER_YEAR;

                if (!combinedData[symbol]) {
                    combinedData[symbol] = { symbol };
                }
                combinedData[symbol][exchange] = normalized8hRate;
            });
        } else {
            console.warn('Variational API returned status:', response.status);
        }
    } catch (error) {
        console.warn('Error fetching Variational API:', error);
    }

    // Convert map to array
    const data = Object.values(combinedData);
    const exchanges = Array.from(exchangesSet).sort();

    return { data, exchanges };
};
