import { useEffect, useState } from "react";
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
  const [data, setData] = useState<ExtendedRow[]>([]);
  const [exchanges, setExchanges] = useState<string[]>([]);
  const [topOpportunities, setTopOpportunities] = useState<
    ArbitrageOpportunity[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "maxGap",
    direction: "desc",
  });

  useEffect(() => {
    const loadData = async () => {
      // Don't show loading on subsequent refreshes to prevent flickering
      if (data.length === 0) setIsLoading(true);

      const { data: rawData, exchanges: excha } = await fetchFundingRates();

      // Process data for arbitrage
      const processedData: ExtendedRow[] = [];
      const opps: ArbitrageOpportunity[] = [];

      rawData.forEach((row) => {
        const arb = calculateArbitrage(row, excha);
        if (arb) {
          // Only include if it has >1 exchange (arb is not null)
          processedData.push({ ...row, maxGap: arb.gap });
          opps.push(arb);
        }
      });

      // Sort opportunities by gap desc
      opps.sort((a, b) => b.gap - a.gap);

      setData(processedData);
      setExchanges(excha);
      setTopOpportunities(opps.slice(0, 5));
      setIsLoading(false);
    };

    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const formatRate = (rate: number | undefined) => {
    if (rate === undefined) return "-";
    // Display as % with 4 decimals
    const percentage = rate * 100;
    return `${percentage.toFixed(4)}%`;
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
          {/* Top 5 Opportunities Table */}
          <section className="top-opportunities">
            <h2>🔥 Top 5 Arbitrage Opportunities</h2>
            <div className="table-wrapper">
              <table className="funding-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Strategy</th>
                    <th>Gap (8h)</th>
                    <th>Highest</th>
                    <th>Lowest</th>
                  </tr>
                </thead>
                <tbody>
                  {topOpportunities.map((opp) => (
                    <tr key={opp.symbol}>
                      <td className="symbol-cell">{opp.symbol}</td>
                      <td className="strategy-cell">{opp.strategy}</td>
                      <td className="text-green font-bold">
                        {(opp.gap * 100).toFixed(4)}%
                      </td>
                      <td>
                        {formatRate(opp.highestRate)}
                        <span className="ex-label">{opp.highestExchange}</span>
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
                    <th
                      onClick={() => handleSort("symbol")}
                      className={
                        sortConfig.key === "symbol"
                          ? `sorted-${sortConfig.direction}`
                          : ""
                      }
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
                        className={
                          sortConfig.key === ex
                            ? `sorted-${sortConfig.direction}`
                            : ""
                        }
                      >
                        {ex.charAt(0).toUpperCase() + ex.slice(1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((row) => (
                    <tr key={row.symbol}>
                      <td className="symbol-cell">{row.symbol}</td>
                      <td className="gap-cell">
                        {row.maxGap ? `${(row.maxGap * 100).toFixed(4)}%` : "-"}
                      </td>
                      {exchanges.map((ex) => {
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
