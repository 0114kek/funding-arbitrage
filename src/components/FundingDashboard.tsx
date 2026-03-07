import { useEffect, useMemo, useState } from "react";
import { fetchFundingRates } from "../services/api";
import type { DashboardRow, SortConfig } from "../types";
import {
  calculateArbitrage,
  type ArbitrageOpportunity,
} from "../utils/arbitrage";
import "./Dashboard.css";

// Extend DashboardRow to include possible gap for sorting
type ExtendedRow = DashboardRow & {
  maxGap?: number;
};

const FundingDashboard = () => {
  const [rawData, setRawData] = useState<DashboardRow[]>([]);
  const [data, setData] = useState<ExtendedRow[]>([]);
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

  // Derive sorted list of all available symbols for the filter panel
  const allSymbols = [...new Set(data.map((row) => row.symbol))].sort();

  const toggleSymbol = (symbol: string) => {
    setHiddenSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const toggleExchange = (
    exchange: string,
    e: React.MouseEvent | React.ChangeEvent,
  ) => {
    e.stopPropagation();
    setHiddenExchanges((prev) => {
      const next = new Set(prev);
      if (next.has(exchange)) {
        next.delete(exchange);
      } else {
        next.add(exchange);
      }
      return next;
    });
  };

  const showAll = () => setHiddenSymbols(new Set());
  const hideAll = () => setHiddenSymbols(new Set(allSymbols));

  useEffect(() => {
    const loadData = async () => {
      // Don't show loading on subsequent refreshes to prevent flickering
      if (data.length === 0) setIsLoading(true);

      const { data: rawResp, exchanges: excha } = await fetchFundingRates();
      setRawData(rawResp);
      setExchanges(excha);
      setIsLoading(false);
    };

    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamic Arbitrage calculation based on visible exchanges
  const { processedData, allOpportunities } = useMemo(() => {
    const visibleExchanges = exchanges.filter((ex) => !hiddenExchanges.has(ex));
    const processed: ExtendedRow[] = [];
    const opps: ArbitrageOpportunity[] = [];

    rawData.forEach((row) => {
      const arb = calculateArbitrage(row, visibleExchanges);
      if (arb) {
        // Only include if it has >1 exchange (arb is not null)

        processed.push({ ...row, maxGap: arb.gap });
        opps.push(arb);
      }
    });

    opps.sort((a, b) => b.gap - a.gap);
    return { processedData: processed, allOpportunities: opps };
  }, [rawData, exchanges, hiddenExchanges]);

  useEffect(() => {
    setData(processedData);
  }, [processedData]);

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "desc";
    if (sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    } else if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    } else if (key === "symbol") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  const sortedData = [...data].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (aValue === undefined && bValue === undefined) return 0;
    if (aValue === undefined) return 1;
    if (bValue === undefined) return -1;

    if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  // Recalculate top 5 excluding hidden symbols
  const topOpportunities = useMemo(
    () =>
      allOpportunities
        .filter((opp) => !hiddenSymbols.has(opp.symbol))
        .slice(0, 5),
    [allOpportunities, hiddenSymbols],
  );

  const formatRate = (rate: number | undefined) => {
    if (rate === undefined) return "-";
    // Convert 8h rate to APR: rate * 1095 (365 * 3), then display as %
    const apr = rate * 1095 * 100;
    return `${apr.toFixed(2)}%`;
  };

  const getRateColor = (rate: number | undefined) => {
    if (rate === undefined) return "";
    if (rate > 0) return "text-green";
    if (rate < 0) return "text-red";
    return "text-gray";
  };

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
          {/* Token Filter Panel */}
          <section className="filter-panel">
            <h2>🔍 Filter Tokens</h2>
            <div className="filter-actions">
              <button className="filter-btn" onClick={showAll}>
                Show All
              </button>
              <button className="filter-btn" onClick={hideAll}>
                Hide All
              </button>
              <span className="filter-count">
                {allSymbols.length - hiddenSymbols.size} / {allSymbols.length}{" "}
                visible
              </span>
            </div>
            <div className="filter-chips">
              {allSymbols.map((symbol) => (
                <label
                  key={symbol}
                  className={`filter-chip ${
                    hiddenSymbols.has(symbol) ? "filter-chip--hidden" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!hiddenSymbols.has(symbol)}
                    onChange={() => toggleSymbol(symbol)}
                  />
                  {symbol}
                </label>
              ))}
            </div>
          </section>

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
                  {topOpportunities
                    .filter((opp) => !hiddenSymbols.has(opp.symbol))
                    .map((opp) => (
                      <tr key={opp.symbol}>
                        <td className="symbol-cell">{opp.symbol}</td>
                        <td className="strategy-cell">{opp.strategy}</td>
                        <td className="text-green font-bold">
                          {(opp.gap * 1095 * 100).toFixed(2)}%
                        </td>
                        <td>
                          {formatRate(opp.highestRate)}
                          <span className="ex-label">
                            {opp.highestExchange}
                          </span>
                        </td>
                        <td>
                          {formatRate(opp.lowestRate)}
                          <span className="ex-label">{opp.lowestExchange}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Main Comparison Table */}
          <section className="all-rates">
            <h2>All Rates</h2>
            <div className="table-wrapper">
              <table className="funding-table">
                <thead>
                  <tr>
                    <th className="th-checkbox">👁</th>
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
                          <input
                            type="checkbox"
                            checked={!hiddenExchanges.has(ex)}
                            onChange={(e) => toggleExchange(ex, e)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span>
                            {ex.charAt(0).toUpperCase() + ex.slice(1)}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedData
                    .filter((row) => !hiddenSymbols.has(row.symbol))
                    .map((row) => (
                      <tr key={row.symbol}>
                        <td className="checkbox-cell">
                          <input
                            type="checkbox"
                            checked={!hiddenSymbols.has(row.symbol)}
                            onChange={() => toggleSymbol(row.symbol)}
                          />
                        </td>
                        <td className="symbol-cell">{row.symbol}</td>
                        <td className="gap-cell">
                          {row.maxGap
                            ? `${(row.maxGap * 1095 * 100).toFixed(2)}%`
                            : "-"}
                        </td>
                        {exchanges.map((ex) => {
                          if (hiddenExchanges.has(ex))
                            return <td key={ex}></td>;
                          const rate = row[ex] as number | undefined;
                          return (
                            <td key={ex} className={getRateColor(rate)}>
                              {formatRate(rate)}
                            </td>
                          );
                        })}
                      </tr>
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
