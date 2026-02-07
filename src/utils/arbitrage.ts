import type { DashboardRow } from '../types';

export interface ArbitrageOpportunity {
    symbol: string;
    gap: number;
    highestExchange: string;
    highestRate: number;
    lowestExchange: string;
    lowestRate: number;
    strategy: string;
}

export const calculateArbitrage = (
    row: DashboardRow,
    exchanges: string[]
): ArbitrageOpportunity | null => {
    let highestRate = -Infinity;
    let lowestRate = Infinity;
    let highestExchange = '';
    let lowestExchange = '';
    let count = 0;

    exchanges.forEach(ex => {
        const rate = row[ex];
        if (typeof rate === 'number') {
            count++;
            if (rate > highestRate) {
                highestRate = rate;
                highestExchange = ex;
            }
            if (rate < lowestRate) {
                lowestRate = rate;
                lowestExchange = ex;
            }
        }
    });

    if (count < 2) return null;

    const gap = highestRate - lowestRate;

    // Strategy: Short High, Long Low
    // Only profitable if gap is positive (High > Low) which is always true if not equal
    // But strictly we want meaningful gaps. 

    const strategy = `Short ${formatEx(highestExchange)} / Long ${formatEx(lowestExchange)}`;

    return {
        symbol: row.symbol,
        gap,
        highestExchange,
        highestRate,
        lowestExchange,
        lowestRate,
        strategy
    };
};

const formatEx = (ex: string) => ex.charAt(0).toUpperCase() + ex.slice(1);
