import type { DashboardRow, FundingRate } from '../types';

const LIGHTER_API_URL = 'https://mainnet.zklighter.elliot.ai/api/v1/funding-rates';
const VARIATIONAL_API_URL = 'https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats';

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

// Number of 8-hour intervals in a year: 365 * 3 = 1095
const INTERVALS_PER_YEAR = 1095;

export const fetchFundingRates = async (): Promise<{ data: DashboardRow[]; exchanges: string[] }> => {
    const combinedData: Record<string, DashboardRow> = {};
    const exchangesSet = new Set<string>();

    // 1. Fetch Lighter API
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

    // 2. Fetch Variational API
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
