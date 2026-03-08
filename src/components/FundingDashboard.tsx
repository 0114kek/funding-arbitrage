import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  memo,
  useDeferredValue,
} from "react";
import { List } from "react-window";
import { fetchFundingRates } from "../services/api";
import type { DashboardRow, SortConfig } from "../types";
import {
  calculateArbitrage,
  type ArbitrageOpportunity,
} from "../utils/arbitrage";
import "./Dashboard.css";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Multiplier to convert an 8-hour rate to an annual percentage (APR %). */
const RATE_TO_APR_PERCENT = 1095 * 100; // 365 × 3 × 100

// ─── Types ───────────────────────────────────────────────────────────────────

type ExtendedRow = DashboardRow & { maxGap?: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const formatRate = (rate: number | undefined) => {
  if (rate === undefined) return "-";
  return `${(rate * RATE_TO_APR_PERCENT).toFixed(2)}%`;
};

const getRateColor = (rate: number | undefined) => {
  if (rate === undefined) return "";
  if (rate > 0) return "text-green";
  if (rate < 0) return "text-red";
  return "text-gray";
};

// ─── Icon Components ─────────────────────────────────────────────────────────

const SearchIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    className="search-icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const FilterIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

// ─── Memoized Subcomponents ──────────────────────────────────────────────────

const FilterItem = memo(
  ({
    label,
    checked,
    onToggle,
    isExchange,
  }: {
    label: string;
    checked: boolean;
    onToggle: (v: string, e?: React.ChangeEvent | React.MouseEvent) => void;
    isExchange?: boolean;
  }) => (
    <label className="filter-list-item">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(label, e)}
        onClick={isExchange ? (e) => e.stopPropagation() : undefined}
      />
      <span className="filter-item-name">
        {isExchange ? capitalize(label) : label}
      </span>
    </label>
  ),
);

const VirtualizedTokenRow = ({
  index,
  style,
  tokens,
  hiddenSymbols,
  toggleSymbol,
}: any) => {
  const symbol = tokens[index];
  return (
    <div style={style}>
      <FilterItem
        label={symbol}
        checked={!hiddenSymbols.has(symbol)}
        onToggle={toggleSymbol}
      />
    </div>
  );
};

const TopOppRow = memo(
  ({
    opp,
    checked,
    onToggle,
  }: {
    opp: ArbitrageOpportunity;
    checked: boolean;
    onToggle: (s: string) => void;
  }) => (
    <tr>
      <td className="symbol-cell has-inline-checkbox">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(opp.symbol)}
          title="Hide from dashboard"
        />
        {opp.symbol}
      </td>
      <td className="strategy-cell">{opp.strategy}</td>
      <td className="text-green font-bold">
        {(opp.gap * RATE_TO_APR_PERCENT).toFixed(2)}%
      </td>
      <td>
        {formatRate(opp.highestRate)}
        <span className="ex-label">{capitalize(opp.highestExchange)}</span>
      </td>
      <td>
        {formatRate(opp.lowestRate)}
        <span className="ex-label">{capitalize(opp.lowestExchange)}</span>
      </td>
    </tr>
  ),
);

const MainTableRow = memo(
  ({
    row,
    exchanges,
    hiddenExchanges,
    checked,
    onToggle,
  }: {
    row: ExtendedRow;
    exchanges: string[];
    hiddenExchanges: Set<string>;
    checked: boolean;
    onToggle: (s: string) => void;
  }) => (
    <tr>
      <td className="symbol-cell has-inline-checkbox">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(row.symbol)}
          title="Hide from dashboard"
        />
        {row.symbol}
      </td>
      <td className="gap-cell">
        {row.maxGap ? `${(row.maxGap * RATE_TO_APR_PERCENT).toFixed(2)}%` : "-"}
      </td>
      {exchanges.map((ex) => {
        if (hiddenExchanges.has(ex)) return <td key={ex}></td>;
        const rate = row[ex] as number | undefined;
        return (
          <td key={ex} className={getRateColor(rate)}>
            {formatRate(rate)}
          </td>
        );
      })}
    </tr>
  ),
);

// ─── Main Component ──────────────────────────────────────────────────────────

const FundingDashboard = () => {
  const [rawData, setRawData] = useState<DashboardRow[]>([]);
  const [exchanges, setExchanges] = useState<string[]>([]);
  const [hiddenExchanges, setHiddenExchanges] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "maxGap",
    direction: "desc",
  });
  const [hiddenSymbols, setHiddenSymbols] = useState<Set<string>>(new Set());

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tableSearchQuery, setTableSearchQuery] = useState("");

  // Defer search queries so typing never blocks the UI thread
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredTableSearchQuery = useDeferredValue(tableSearchQuery);

  const filterRef = useRef<HTMLDivElement>(null);

  // ─── Derived / Memoized Data ─────────────────────────────────────────────

  // Dynamic Arbitrage calculation based on visible exchanges
  const { processedData, allOpportunities } = useMemo(() => {
    const visibleExchanges = exchanges.filter((ex) => !hiddenExchanges.has(ex));
    const processed: ExtendedRow[] = [];
    const opps: ArbitrageOpportunity[] = [];

    rawData.forEach((row) => {
      const arb = calculateArbitrage(row, visibleExchanges);
      if (arb) {
        processed.push({ ...row, maxGap: arb.gap });
        opps.push(arb);
      }
    });

    opps.sort((a, b) => b.gap - a.gap);
    return { processedData: processed, allOpportunities: opps };
  }, [rawData, exchanges, hiddenExchanges]);

  // Memoize the symbol list so it doesn't re-create on every render
  const allSymbols = useMemo(
    () => [...new Set(processedData.map((row) => row.symbol))].sort(),
    [processedData],
  );

  const filteredSymbols = useMemo(() => {
    if (!deferredSearchQuery) return allSymbols;
    const lowerQuery = deferredSearchQuery.toLowerCase();
    return allSymbols.filter((s) => s.toLowerCase().includes(lowerQuery));
  }, [allSymbols, deferredSearchQuery]);

  const filteredExchanges = useMemo(() => {
    if (!deferredSearchQuery) return exchanges;
    const lowerQuery = deferredSearchQuery.toLowerCase();
    return exchanges.filter((ex) => ex.toLowerCase().includes(lowerQuery));
  }, [exchanges, deferredSearchQuery]);

  // Memoize sorted data to avoid re-sorting ~400 rows on every render
  const sortedData = useMemo(() => {
    return [...processedData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return 1;
      if (bValue === undefined) return -1;

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [processedData, sortConfig]);

  // Recalculate top 5 excluding hidden symbols
  const topOpportunities = useMemo(
    () =>
      allOpportunities
        .filter((opp) => !hiddenSymbols.has(opp.symbol))
        .slice(0, 5),
    [allOpportunities, hiddenSymbols],
  );

  // ─── Effects ─────────────────────────────────────────────────────────────

  // Handle clicking outside of dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterRef.current &&
        !filterRef.current.contains(event.target as Node)
      ) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFilterOpen]);

  useEffect(() => {
    const loadData = async () => {
      if (rawData.length === 0) setIsLoading(true);

      const { data: rawResp, exchanges: excha } = await fetchFundingRates();
      setRawData(rawResp);
      setExchanges(excha);
      setIsLoading(false);
    };

    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Stable Callbacks ────────────────────────────────────────────────────

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
    setSearchQuery("");
    setTableSearchQuery("");
  }, []);

  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => {
      let direction: "asc" | "desc" = "desc";
      if (prev.key === key && prev.direction === "desc") {
        direction = "asc";
      } else if (prev.key === key && prev.direction === "asc") {
        direction = "desc";
      } else if (key === "symbol") {
        direction = "asc";
      }
      return { key, direction };
    });
  }, []);

  const tokenItemData = useMemo(
    () => ({
      tokens: filteredSymbols,
      hiddenSymbols,
      toggleSymbol,
    }),
    [filteredSymbols, hiddenSymbols, toggleSymbol],
  );

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Funding Arbitrage Dashboard</h1>
        <p className="subtitle">
          Real-time funding rate comparison & Arbitrage Finder
        </p>
      </header>

      {isLoading ? (
        <div className="loading">Loading funding rates...</div>
      ) : (
        <>
          {/* Top 5 Opportunities Table */}
          <section className="top-opportunities">
            <h2>🔥 Top 5 Arbitrage Opportunities</h2>
            <div className="table-wrapper">
              <table className="funding-table">
                <thead>
                  <tr>
                    <th className="th-symbol">Symbol</th>
                    <th>Strategy</th>
                    <th>Gap (APR)</th>
                    <th>Highest</th>
                    <th>Lowest</th>
                  </tr>
                </thead>
                <tbody>
                  {topOpportunities.map((opp) => (
                    <TopOppRow
                      key={opp.symbol}
                      opp={opp}
                      checked={!hiddenSymbols.has(opp.symbol)}
                      onToggle={toggleSymbol}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Main Controls Area for Both Tables */}
          <div className="dashboard-controls">
            <div className="main-search-wrapper">
              <SearchIcon />
              <input
                type="text"
                placeholder="Search tokens in table..."
                value={tableSearchQuery}
                onChange={(e) => setTableSearchQuery(e.target.value)}
              />
              {tableSearchQuery && (
                <button
                  className="filter-clear-btn"
                  onClick={() => setTableSearchQuery("")}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="filter-dropdown-container" ref={filterRef}>
              <button
                className={`filter-toggle-btn ${isFilterOpen ? "active" : ""}`}
                onClick={() => setIsFilterOpen(!isFilterOpen)}
              >
                <span className="filter-icon">
                  <FilterIcon />
                </span>
                Filter Settings
              </button>

              {isFilterOpen && (
                <div className="filter-dropdown-menu">
                  <div className="filter-header-row">
                    <div className="filter-search-input-wrapper">
                      <SearchIcon size={14} />
                      <input
                        type="text"
                        placeholder="Search assets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    {searchQuery && (
                      <button
                        className="filter-clear-btn"
                        onClick={() => setSearchQuery("")}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="filter-list-body">
                    {filteredExchanges.length > 0 && (
                      <div className="filter-group">
                        <div className="filter-group-title">Exchanges</div>
                        {filteredExchanges.map((ex) => (
                          <FilterItem
                            key={ex}
                            label={ex}
                            checked={!hiddenExchanges.has(ex)}
                            onToggle={toggleExchange}
                            isExchange
                          />
                        ))}
                      </div>
                    )}

                    {filteredSymbols.length > 0 && (
                      <div className="filter-group">
                        <div className="filter-group-title">Tokens</div>
                        <List
                          style={{ height: 200, width: "100%" }}
                          rowCount={filteredSymbols.length}
                          rowHeight={32}
                          rowComponent={VirtualizedTokenRow}
                          rowProps={tokenItemData}
                        />
                      </div>
                    )}

                    {filteredExchanges.length === 0 &&
                      filteredSymbols.length === 0 && (
                        <div className="filter-no-results">
                          No tokens or exchanges found
                        </div>
                      )}
                  </div>
                  <div className="filter-footer">
                    <button className="filter-reset-btn" onClick={resetFilters}>
                      Reset Filters
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Comparison Table */}
          <section className="all-rates">
            <h2>All Rates</h2>
            <div className="table-wrapper">
              <table className="funding-table">
                <thead>
                  <tr>
                    <th
                      onClick={() => handleSort("symbol")}
                      className={`th-symbol ${
                        sortConfig.key === "symbol"
                          ? `sorted-${sortConfig.direction}`
                          : ""
                      }`}
                    >
                      Symbol
                    </th>
                    <th
                      onClick={() => handleSort("maxGap")}
                      className={
                        sortConfig.key === "maxGap"
                          ? `sorted-${sortConfig.direction}`
                          : ""
                      }
                    >
                      Max Gap
                    </th>
                    {exchanges.map((ex) => (
                      <th
                        key={ex}
                        onClick={() => handleSort(ex)}
                        className={`th-exchange ${
                          sortConfig.key === ex
                            ? `sorted-${sortConfig.direction}`
                            : ""
                        } ${hiddenExchanges.has(ex) ? "th-exchange--hidden" : ""}`}
                      >
                        <div className="th-exchange-content">
                          <span>{capitalize(ex)}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedData
                    .filter((row) => {
                      if (hiddenSymbols.has(row.symbol)) return false;
                      if (
                        deferredTableSearchQuery &&
                        !row.symbol
                          .toLowerCase()
                          .includes(deferredTableSearchQuery.toLowerCase())
                      )
                        return false;
                      return true;
                    })
                    .map((row) => (
                      <MainTableRow
                        key={row.symbol}
                        row={row}
                        exchanges={exchanges}
                        hiddenExchanges={hiddenExchanges}
                        checked={!hiddenSymbols.has(row.symbol)}
                        onToggle={toggleSymbol}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default FundingDashboard;
