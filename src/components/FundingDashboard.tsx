import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchFundingRates } from '../services/api';
import type {
  DashboardRow,
  ExchangeStatus,
  ExtendedDashboardRow,
  RateDisplayMode,
  SortConfig,
} from '../types';
import {
  calculateArbitrage,
  RATE_TO_APR_PERCENT,
  type ArbitrageOpportunity,
} from '../utils/arbitrage';
import { DashboardHeader } from './DashboardHeader';
import { FilterDropdown } from './FilterDropdown';
import { SearchIcon } from './Icons';
import { PaginationControls } from './PaginationControls';
import { RatesTable } from './RatesTable';
import { TopOpportunitiesTable } from './TopOpportunitiesTable';
import './Dashboard.css';

const ROWS_PER_PAGE = 100;
const REFRESH_INTERVAL_SECONDS = 60;

const MIN_GAP_OPTIONS = [
  { label: 'All Spreads', value: 0 },
  { label: '> 5% APR', value: 0.05 },
  { label: '> 10% APR', value: 0.1 },
  { label: '> 20% APR', value: 0.2 },
  { label: '> 50% APR', value: 0.5 },
];

export const FundingDashboard: React.FC = () => {
  const [rawData, setRawData] = useState<DashboardRow[]>([]);
  const [exchanges, setExchanges] = useState<string[]>([]);
  const [exchangeStatuses, setExchangeStatuses] = useState<Record<string, ExchangeStatus>>({});
  const [hiddenExchanges, setHiddenExchanges] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number>(REFRESH_INTERVAL_SECONDS);

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'maxGap',
    direction: 'desc',
  });

  const [hiddenSymbols, setHiddenSymbols] = useState<Set<string>>(new Set());
  const [pinnedSymbols, setPinnedSymbols] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('pinnedSymbols');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [minGapThreshold, setMinGapThreshold] = useState<number>(0);
  const [rateDisplayMode, setRateDisplayMode] = useState<RateDisplayMode>('apr');
  const [currentPage, setCurrentPage] = useState(1);

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchFundingRates();
      setRawData(result.data);
      setExchanges(result.exchanges);
      setExchangeStatuses(result.exchangeStatuses);
      setLastUpdated(new Date());
      setCountdown(REFRESH_INTERVAL_SECONDS);
    } catch (err) {
      console.error('Failed to load funding rates:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Countdown and periodic refresh timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadData();
          return REFRESH_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [loadData]);

  // Persist pinned symbols
  useEffect(() => {
    localStorage.setItem('pinnedSymbols', JSON.stringify(Array.from(pinnedSymbols)));
  }, [pinnedSymbols]);

  // ─── Derived / Memoized Data ─────────────────────────────────────────────

  // Dynamic Arbitrage calculation based on visible exchanges
  const { processedData, allOpportunities } = useMemo(() => {
    const visibleExchanges = exchanges.filter((ex) => !hiddenExchanges.has(ex));
    const processed: ExtendedDashboardRow[] = [];
    const opps: ArbitrageOpportunity[] = [];

    rawData.forEach((row) => {
      const arb = calculateArbitrage(row, visibleExchanges);
      if (arb) {
        processed.push({ ...row, maxGap: arb.gap });
        opps.push(arb);
      } else {
        processed.push(row);
      }
    });

    opps.sort((a, b) => b.gap - a.gap);
    return { processedData: processed, allOpportunities: opps };
  }, [rawData, exchanges, hiddenExchanges]);

  // Unique list of all available symbols for the filter dropdown
  const allSymbols = useMemo(
    () => [...new Set(rawData.map((row) => row.symbol))].sort(),
    [rawData],
  );

  // Recalculate top 5 excluding hidden symbols and filtering positive gaps
  const topOpportunities = useMemo(
    () =>
      allOpportunities
        .filter((opp) => !hiddenSymbols.has(opp.symbol) && opp.gap > 0)
        .slice(0, 5),
    [allOpportunities, hiddenSymbols],
  );

  // Memoize sorted data to avoid re-sorting ~500+ rows on every render
  const sortedData = useMemo(() => {
    return [...processedData].sort((a, b) => {
      const aPinned = pinnedSymbols.has(a.symbol);
      const bPinned = pinnedSymbols.has(b.symbol);

      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return 1;
      if (bValue === undefined) return -1;

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [processedData, sortConfig, pinnedSymbols]);

  // Filter table data by search query and min spread
  const filteredTableData = useMemo(() => {
    const query = tableSearchQuery.trim().toLowerCase();

    return sortedData.filter((row) => {
      if (hiddenSymbols.has(row.symbol)) return false;

      // Filter by minimum spread in APR decimal (e.g. 0.05 = 5% APR)
      if (minGapThreshold > 0) {
        const gapApr = (row.maxGap ?? 0) * (RATE_TO_APR_PERCENT / 100);
        if (gapApr < minGapThreshold) return false;
      }

      // Filter by symbol search query
      if (query && !row.symbol.toLowerCase().includes(query)) {
        return false;
      }

      return true;
    });
  }, [sortedData, hiddenSymbols, minGapThreshold, tableSearchQuery]);

  // Calculate pagination safely without useEffect setState violations
  const totalPages = Math.max(1, Math.ceil(filteredTableData.length / ROWS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedData = useMemo(() => {
    const start = (safeCurrentPage - 1) * ROWS_PER_PAGE;
    return filteredTableData.slice(start, start + ROWS_PER_PAGE);
  }, [filteredTableData, safeCurrentPage]);

  // ─── Callbacks ───────────────────────────────────────────────────────────

  const toggleSymbol = useCallback((symbol: string) => {
    setHiddenSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  }, []);

  const togglePin = useCallback((symbol: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPinnedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  }, []);

  const toggleExchange = useCallback(
    (exchange: string, e?: React.MouseEvent | React.ChangeEvent) => {
      if (e) e.stopPropagation();
      setHiddenExchanges((prev) => {
        const next = new Set(prev);
        if (next.has(exchange)) {
          next.delete(exchange);
        } else {
          next.add(exchange);
        }
        return next;
      });
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setHiddenSymbols(new Set());
    setHiddenExchanges(new Set());
    setMinGapThreshold(0);
    setTableSearchQuery('');
    setCurrentPage(1);
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setTableSearchQuery(val);
    setCurrentPage(1);
  }, []);

  const handleMinGapChange = useCallback((val: number) => {
    setMinGapThreshold(val);
    setCurrentPage(1);
  }, []);

  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => {
      let direction: 'asc' | 'desc' = 'desc';
      if (prev.key === key && prev.direction === 'desc') {
        direction = 'asc';
      } else if (prev.key === key && prev.direction === 'asc') {
        direction = 'desc';
      } else if (key === 'symbol') {
        direction = 'asc';
      }
      return { key, direction };
    });
  }, []);

  return (
    <div className="dashboard-container">
      <DashboardHeader
        exchangeStatuses={exchangeStatuses}
        lastUpdated={lastUpdated}
        countdown={countdown}
        isLoading={isLoading}
        onRefresh={loadData}
        rateDisplayMode={rateDisplayMode}
        onToggleRateDisplayMode={setRateDisplayMode}
      />

      {rawData.length === 0 && isLoading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Fetching real-time funding rates from all exchanges...</p>
        </div>
      ) : (
        <>
          {/* Top 5 Opportunities Table */}
          <TopOpportunitiesTable
            opportunities={topOpportunities}
            pinnedSymbols={pinnedSymbols}
            hiddenSymbols={hiddenSymbols}
            onTogglePin={togglePin}
            onToggleSymbol={toggleSymbol}
            rateDisplayMode={rateDisplayMode}
          />

          {/* Table Controls: Search, Min Gap Filter, and Filter Settings Popover */}
          <div className="dashboard-controls">
            <div className="main-search-wrapper">
              <SearchIcon size={16} />
              <input
                type="text"
                placeholder="Search tokens (e.g. BTC, ETH, SOL, PEPE)..."
                value={tableSearchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {tableSearchQuery && (
                <button
                  type="button"
                  className="filter-clear-btn"
                  onClick={() => handleSearchChange('')}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Min Spread Filter Pills */}
            <div className="min-gap-pills">
              {MIN_GAP_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  className={`min-gap-pill ${minGapThreshold === opt.value ? 'active' : ''}`}
                  onClick={() => handleMinGapChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Popover Filter Menu */}
            <FilterDropdown
              exchanges={exchanges}
              hiddenExchanges={hiddenExchanges}
              allSymbols={allSymbols}
              hiddenSymbols={hiddenSymbols}
              onToggleExchange={toggleExchange}
              onToggleSymbol={toggleSymbol}
              onResetFilters={resetFilters}
            />
          </div>

          {/* Main Comparison Table */}
          <RatesTable
            data={paginatedData}
            exchanges={exchanges}
            hiddenExchanges={hiddenExchanges}
            pinnedSymbols={pinnedSymbols}
            hiddenSymbols={hiddenSymbols}
            sortConfig={sortConfig}
            rateDisplayMode={rateDisplayMode}
            onSort={handleSort}
            onTogglePin={togglePin}
            onToggleSymbol={toggleSymbol}
          />

          {/* Pagination Controls */}
          <PaginationControls
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            totalItems={filteredTableData.length}
            pageSize={ROWS_PER_PAGE}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
};

export default FundingDashboard;
