import type { DashboardRow, RateDisplayMode } from '../types';

export interface ArbitrageOpportunity {
  symbol: string;
  gap: number;
  highestExchange: string;
  highestRate: number;
  lowestExchange: string;
  lowestRate: number;
  strategy: string;
}

/** Multipliers for rate conversions */
export const RATE_TO_APR_PERCENT = 1095 * 100; // 365 days × 3 intervals/day × 100%
export const RATE_TO_8H_PERCENT = 100; // 1 × 100%

export const capitalize = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

/**
 * Format an 8-hour decimal rate according to the selected display mode:
 * - 'apr': annualized percentage rate (e.g. "10.95%")
 * - '8h': 8-hour period rate (e.g. "0.0100%")
 */
export const formatRateValue = (
  rate: number | undefined,
  mode: RateDisplayMode = 'apr',
  precision?: number,
): string => {
  if (rate === undefined || isNaN(rate)) return '-';

  if (mode === '8h') {
    const decimals = precision ?? 4;
    return `${(rate * RATE_TO_8H_PERCENT).toFixed(decimals)}%`;
  }

  const decimals = precision ?? 2;
  return `${(rate * RATE_TO_APR_PERCENT).toFixed(decimals)}%`;
};

/** Get CSS color class based on whether the rate is positive, negative, or neutral */
export const getRateColorClass = (rate: number | undefined): string => {
  if (rate === undefined || isNaN(rate)) return '';
  if (rate > 0.000001) return 'text-green';
  if (rate < -0.000001) return 'text-red';
  return 'text-gray';
};

/** Calculate arbitrage opportunity between available visible exchanges */
export const calculateArbitrage = (
  row: DashboardRow,
  exchanges: string[],
): ArbitrageOpportunity | null => {
  let highestRate = -Infinity;
  let lowestRate = Infinity;
  let highestExchange = '';
  let lowestExchange = '';
  let count = 0;

  for (const ex of exchanges) {
    const rate = row[ex];
    if (typeof rate === 'number' && !isNaN(rate)) {
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
  }

  // Need at least 2 different exchanges to form an arbitrage spread
  if (count < 2 || highestExchange === lowestExchange) return null;

  const gap = highestRate - lowestRate;
  if (gap < 0) return null;

  // Strategy: Short the highest funding rate exchange (to receive funding),
  // Long the lowest funding rate exchange (pay lower funding or receive funding if negative)
  const strategy = `Short ${capitalize(highestExchange)} / Long ${capitalize(lowestExchange)}`;

  return {
    symbol: row.symbol,
    gap,
    highestExchange,
    highestRate,
    lowestExchange,
    lowestRate,
    strategy,
  };
};

/** Generate direct trading URL for supported exchanges */
export const getExchangeTradeUrl = (exchange: string, symbol: string): string | null => {
  const normSym = symbol.toUpperCase();
  switch (exchange.toLowerCase()) {
    case 'binance':
      return `https://www.binance.com/en/futures/${normSym}USDT`;
    case 'hyperliquid':
      return `https://app.hyperliquid.xyz/trade/${normSym}`;
    case 'lighter':
      return `https://app.lighter.xyz/trade/${normSym}`;
    case 'variational':
      return `https://omni.variational.io/trade/${normSym}`;
    default:
      return null;
  }
};

