export interface FundingRate {
    market_id?: number;
    exchange: string;
    symbol: string;
    rate: number;
}

export interface DashboardRow {
    symbol: string;
    [exchange: string]: number | string | undefined; // Added undefined to make it easier to extend
}

export type SortKey = 'symbol' | string;
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}
