import React from 'react';
import type { ExtendedDashboardRow, RateDisplayMode, SortConfig } from '../types';
import {
  capitalize,
  formatRateValue,
  getExchangeTradeUrl,
  getRateColorClass,
  RATE_TO_APR_PERCENT,
  RATE_TO_8H_PERCENT,
} from '../utils/arbitrage';
import { ExternalLinkIcon, StarIcon } from './Icons';

interface RatesTableProps {
  data: ExtendedDashboardRow[];
  exchanges: string[];
  hiddenExchanges: Set<string>;
  pinnedSymbols: Set<string>;
  hiddenSymbols: Set<string>;
  sortConfig: SortConfig;
  rateDisplayMode: RateDisplayMode;
  onSort: (key: string) => void;
  onTogglePin: (symbol: string, e?: React.MouseEvent) => void;
  onToggleSymbol: (symbol: string) => void;
}

export const RatesTable: React.FC<RatesTableProps> = ({
  data,
  exchanges,
  hiddenExchanges,
  pinnedSymbols,
  hiddenSymbols,
  sortConfig,
  rateDisplayMode,
  onSort,
  onTogglePin,
  onToggleSymbol,
}) => {
  const getSortIndicator = (key: string) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  const formatGap = (gap: number | undefined) => {
    if (gap === undefined || isNaN(gap)) return '-';
    if (rateDisplayMode === '8h') {
      return `${(gap * RATE_TO_8H_PERCENT).toFixed(4)}%`;
    }
    return `${(gap * RATE_TO_APR_PERCENT).toFixed(2)}%`;
  };

  return (
    <section className="all-rates">
      <div className="section-header">
        <h2>All Rates ({data.length} Assets)</h2>
        <span className="section-subtitle">
          Showing funding rates normalized to {rateDisplayMode === 'apr' ? 'APR (Annualized)' : '8-Hour rate'}
        </span>
      </div>

      <div className="table-wrapper">
        <table className="funding-table">
          <thead>
            <tr>
              <th
                onClick={() => onSort('symbol')}
                className={`th-symbol ${
                  sortConfig.key === 'symbol' ? `sorted-${sortConfig.direction}` : ''
                }`}
              >
                Symbol {getSortIndicator('symbol')}
              </th>

              <th
                onClick={() => onSort('maxGap')}
                className={`th-gap ${
                  sortConfig.key === 'maxGap' ? `sorted-${sortConfig.direction}` : ''
                }`}
              >
                Max Spread {getSortIndicator('maxGap')}
              </th>

              {exchanges.map((ex) => (
                <th
                  key={ex}
                  onClick={() => onSort(ex)}
                  className={`th-exchange ${
                    sortConfig.key === ex ? `sorted-${sortConfig.direction}` : ''
                  } ${hiddenExchanges.has(ex) ? 'th-exchange--hidden' : ''}`}
                >
                  <div className="th-exchange-content">
                    <span>{capitalize(ex)}</span>
                    {getSortIndicator(ex)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={2 + exchanges.length} className="no-data-cell">
                  No assets found matching your search or filters.
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const isPinned = pinnedSymbols.has(row.symbol);
                const isVisible = !hiddenSymbols.has(row.symbol);

                return (
                  <tr
                    key={row.symbol}
                    className={`table-row ${isPinned ? 'pinned-row' : ''}`}
                  >
                    <td className="symbol-cell has-inline-checkbox">
                      <button
                        type="button"
                        className="pin-btn"
                        onClick={(e) => onTogglePin(row.symbol, e)}
                        title={isPinned ? 'Unpin token' : 'Pin token to top'}
                      >
                        <StarIcon size={15} filled={isPinned} />
                      </button>
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => onToggleSymbol(row.symbol)}
                        title="Hide/Show from dashboard"
                      />
                      <span className="symbol-name">{row.symbol}</span>
                    </td>

                    <td className="gap-cell font-bold">
                      {formatGap(row.maxGap)}
                    </td>

                    {exchanges.map((ex) => {
                      if (hiddenExchanges.has(ex)) {
                        return <td key={ex} className="hidden-exchange-cell">-</td>;
                      }

                      const rate = row[ex] as number | undefined;
                      const tradeUrl = rate !== undefined ? getExchangeTradeUrl(ex, row.symbol) : null;

                      return (
                        <td key={ex} className={getRateColorClass(rate)}>
                          <div className="rate-cell-wrapper">
                            <span>{formatRateValue(rate, rateDisplayMode)}</span>
                            {tradeUrl && (
                              <a
                                href={tradeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="table-trade-link"
                                title={`Trade ${row.symbol} on ${capitalize(ex)}`}
                              >
                                <ExternalLinkIcon size={10} />
                              </a>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
