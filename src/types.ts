export interface FundingRate {
  market_id?: number;
  exchange: string;
  symbol: string;
  rate: number;
}

export interface DashboardRow {
  symbol: string;
  [exchange: string]: number | string | undefined;
}

export interface ExtendedDashboardRow extends DashboardRow {
  maxGap?: number;
}

export type SortKey = 'symbol' | string;
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export type RateDisplayMode = 'apr' | '8h';

export interface ExchangeStatus {
  name: string;
  status: 'online' | 'offline' | 'loading';
  count: number;
  lastUpdated?: Date;
  error?: string;
}

export interface FetchFundingRatesResult {
  data: DashboardRow[];
  exchanges: string[];
  exchangeStatuses: Record<string, ExchangeStatus>;
}

