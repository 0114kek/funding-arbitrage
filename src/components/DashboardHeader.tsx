import React from 'react';
import type { ExchangeStatus, RateDisplayMode } from '../types';
import { RefreshIcon } from './Icons';

interface DashboardHeaderProps {
  exchangeStatuses: Record<string, ExchangeStatus>;
  lastUpdated: Date | null;
  countdown: number;
  isLoading: boolean;
  onRefresh: () => void;
  rateDisplayMode: RateDisplayMode;
  onToggleRateDisplayMode: (mode: RateDisplayMode) => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  exchangeStatuses,
  lastUpdated,
  countdown,
  isLoading,
  onRefresh,
  rateDisplayMode,
  onToggleRateDisplayMode,
}) => {
  const formatTime = (d: Date | null) => {
    if (!d) return '--:--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <header className="dashboard-header">
      <div className="header-top">
        <div>
          <h1 className="header-title">Funding Arbitrage Dashboard</h1>
          <p className="subtitle">
            Real-time funding rate comparison & Cross-exchange Arbitrage Finder
          </p>
        </div>

        <div className="header-actions">
          {/* Rate Mode Toggle Switch */}
          <div className="rate-mode-toggle">
            <button
              type="button"
              className={`mode-btn ${rateDisplayMode === 'apr' ? 'active' : ''}`}
              onClick={() => onToggleRateDisplayMode('apr')}
              title="Display rates as Annualized Percentage Rate"
            >
              APR %
            </button>
            <button
              type="button"
              className={`mode-btn ${rateDisplayMode === '8h' ? 'active' : ''}`}
              onClick={() => onToggleRateDisplayMode('8h')}
              title="Display rates as standard 8-Hour Funding Rate"
            >
              8h Rate %
            </button>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            className="refresh-btn"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh funding rates now"
          >
            <RefreshIcon size={16} spinning={isLoading} />
            <span>{isLoading ? 'Updating...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Meta Bar: Status badges and sync info */}
      <div className="header-meta-bar">
        <div className="exchange-status-group">
          {Object.entries(exchangeStatuses).map(([key, status]) => (
            <div
              key={key}
              className={`exchange-badge ${status.status}`}
              title={status.error ? `Error: ${status.error}` : `${status.name}: ${status.count} markets`}
            >
              <span className={`status-dot ${status.status}`} />
              <span className="exchange-name">{status.name}</span>
              {status.count > 0 && <span className="exchange-count">({status.count})</span>}
            </div>
          ))}
        </div>

        <div className="sync-info-group">
          <span className="last-updated-text">
            Updated: {formatTime(lastUpdated)}
          </span>
          <span className="countdown-pill" title="Time until next auto-refresh">
            Next in {countdown}s
          </span>
        </div>
      </div>
    </header>
  );
};
