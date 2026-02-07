import type { DashboardRow, FundingRate } from '../types';

const LIGHTER_API_URL = 'https://mainnet.zklighter.elliot.ai/api/v1/funding-rates';
const VARIATIONAL_API_URL = 'https://omni.variational.io/api/metadata/supported_assets';

interface LighterResponse {
    code: number;
    funding_rates: FundingRate[];
}

interface VariationalAsset {
    asset: string;
    funding_rate: string;
    funding_interval_s: number;
}

type VariationalResponse = Record<string, VariationalAsset[]>;

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

            Object.entries(json).forEach(([keySymbol, assets]) => {
                if (assets && assets.length > 0) {
                    const asset = assets[0];
                    // Use asset name or key? key seems to be symbol
                    const symbol = keySymbol.toUpperCase();

                    if (asset.funding_rate) {
                        const rawRate = parseFloat(asset.funding_rate);

                        // Variational = Annualized (APR)
                        // Lighter = 8-hour rate (assumed based on user input, standard perp contract)
                        // To compare, we convert Variational to 8-hour rate.
                        // 8h Rate = Annual Rate / (365 days * 3 intervals/day)
                        const normalized8hRate = rawRate / 1095;

                        if (!combinedData[symbol]) {
                            combinedData[symbol] = { symbol };
                        }
                        combinedData[symbol][exchange] = normalized8hRate;
                    }
                }
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
