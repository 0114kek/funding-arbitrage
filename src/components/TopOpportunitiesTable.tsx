import React from 'react';
import type { RateDisplayMode } from '../types';
import {
  type ArbitrageOpportunity,
  capitalize,
  formatRateValue,
  getExchangeTradeUrl,
  getRateColorClass,
  RATE_TO_APR_PERCENT,
  RATE_TO_8H_PERCENT,
} from '../utils/arbitrage';
import { ExternalLinkIcon, StarIcon } from './Icons';

interface TopOpportunitiesTableProps {
  opportunities: ArbitrageOpportunity[];
  pinnedSymbols: Set<string>;
  hiddenSymbols: Set<string>;
  onTogglePin: (symbol: string, e?: React.MouseEvent) => void;
  onToggleSymbol: (symbol: string) => void;
  rateDisplayMode: RateDisplayMode;
}

export const TopOpportunitiesTable: React.FC<TopOpportunitiesTableProps> = ({
  opportunities,
  pinnedSymbols,
  hiddenSymbols,
  onTogglePin,
  onToggleSymbol,
  rateDisplayMode,
}) => {
  if (opportunities.length === 0) {
    return (
      <section className="top-opportunities">
        <h2>🔥 Top 5 Arbitrage Opportunities</h2>
        <div className="empty-card">
          No arbitrage opportunities available for the currently selected visible exchanges.
        </div>
      </section>
    );
  }

  const formatGap = (gap: number) => {
    if (rateDisplayMode === '8h') {
      return `${(gap * RATE_TO_8H_PERCENT).toFixed(4)}%`;
    }
    return `${(gap * RATE_TO_APR_PERCENT).toFixed(2)}%`;
  };

  return (
    <section className="top-opportunities">
      <div className="section-header">
        <h2>🔥 Top 5 Arbitrage Opportunities</h2>
        <span className="section-subtitle">
          Largest spread between highest & lowest funding rates ({rateDisplayMode.toUpperCase()})
        </span>
      </div>

      <div className="table-wrapper">
        <table className="funding-table">
          <thead>
            <tr>
              <th className="th-symbol">Symbol</th>
              <th>Strategy</th>
              <th>Spread ({rateDisplayMode.toUpperCase()})</th>
              <th>Highest Rate (Short)</th>
              <th>Lowest Rate (Long)</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.map((opp) => {
              const isPinned = pinnedSymbols.has(opp.symbol);
              const isVisible = !hiddenSymbols.has(opp.symbol);
              const highUrl = getExchangeTradeUrl(opp.highestExchange, opp.symbol);
              const lowUrl = getExchangeTradeUrl(opp.lowestExchange, opp.symbol);

              return (
                <tr key={opp.symbol} className="opportunity-row">
                  <td className="symbol-cell has-inline-checkbox">
                    <button
                      type="button"
                      className="pin-btn"
                      onClick={(e) => onTogglePin(opp.symbol, e)}
                      title={isPinned ? 'Unpin token' : 'Pin token to top'}
                    >
                      <StarIcon size={15} filled={isPinned} />
                    </button>
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => onToggleSymbol(opp.symbol)}
                      title="Toggle token visibility"
                    />
                    <span className="symbol-name">{opp.symbol}</span>
                  </td>

                  <td className="strategy-cell">
                    <span className="strategy-badge">{opp.strategy}</span>
                  </td>

                  <td className="spread-cell">
                    <span className="spread-value text-green font-bold">
                      {formatGap(opp.gap)}
                    </span>
                  </td>

                  <td>
                    <span className={getRateColorClass(opp.highestRate)}>
                      {formatRateValue(opp.highestRate, rateDisplayMode)}
                    </span>
                    {highUrl ? (
                      <a
                        href={highUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ex-label-link"
                        title={`Open ${opp.symbol} on ${capitalize(opp.highestExchange)}`}
                      >
                        <span className="ex-label">
                          {capitalize(opp.highestExchange)}
                          <ExternalLinkIcon size={10} />
                        </span>
                      </a>
                    ) : (
                      <span className="ex-label">{capitalize(opp.highestExchange)}</span>
                    )}
                  </td>

                  <td>
                    <span className={getRateColorClass(opp.lowestRate)}>
                      {formatRateValue(opp.lowestRate, rateDisplayMode)}
                    </span>
                    {lowUrl ? (
                      <a
                        href={lowUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ex-label-link"
                        title={`Open ${opp.symbol} on ${capitalize(opp.lowestExchange)}`}
                      >
                        <span className="ex-label">
                          {capitalize(opp.lowestExchange)}
                          <ExternalLinkIcon size={10} />
                        </span>
                      </a>
                    ) : (
                      <span className="ex-label">{capitalize(opp.lowestExchange)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
