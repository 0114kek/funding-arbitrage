import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { capitalize } from '../utils/arbitrage';
import { FilterIcon, SearchIcon } from './Icons';

interface FilterDropdownProps {
  exchanges: string[];
  hiddenExchanges: Set<string>;
  allSymbols: string[];
  hiddenSymbols: Set<string>;
  onToggleExchange: (exchange: string, e?: React.MouseEvent | React.ChangeEvent) => void;
  onToggleSymbol: (symbol: string) => void;
  onResetFilters: () => void;
}

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

FilterItem.displayName = 'FilterItem';

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  exchanges,
  hiddenExchanges,
  allSymbols,
  hiddenSymbols,
  onToggleExchange,
  onToggleSymbol,
  onResetFilters,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredExchanges = useMemo(() => {
    if (!dropdownSearch) return exchanges;
    const query = dropdownSearch.toLowerCase();
    return exchanges.filter((ex) => ex.toLowerCase().includes(query));
  }, [exchanges, dropdownSearch]);

  const filteredSymbols = useMemo(() => {
    if (!dropdownSearch) return allSymbols;
    const query = dropdownSearch.toLowerCase();
    return allSymbols.filter((s) => s.toLowerCase().includes(query));
  }, [allSymbols, dropdownSearch]);

  const activeFiltersCount = hiddenExchanges.size + hiddenSymbols.size;

  return (
    <div className="filter-dropdown-container" ref={dropdownRef}>
      <button
        type="button"
        className={`filter-toggle-btn ${isOpen ? 'active' : ''} ${activeFiltersCount > 0 ? 'has-filters' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Filter visible exchanges and tokens"
      >
        <span className="filter-icon">
          <FilterIcon />
        </span>
        <span>Filter Settings</span>
        {activeFiltersCount > 0 && (
          <span className="filter-active-count">({activeFiltersCount} hidden)</span>
        )}
      </button>

      {isOpen && (
        <div className="filter-dropdown-menu">
          <div className="filter-header-row">
            <div className="filter-search-input-wrapper">
              <SearchIcon size={14} />
              <input
                type="text"
                placeholder="Search filters..."
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
                autoFocus
              />
            </div>
            {dropdownSearch && (
              <button
                type="button"
                className="filter-clear-btn"
                onClick={() => setDropdownSearch('')}
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
                    onToggle={onToggleExchange}
                    isExchange
                  />
                ))}
              </div>
            )}

            {filteredSymbols.length > 0 && (
              <div className="filter-group">
                <div className="filter-group-title">
                  Tokens ({filteredSymbols.length})
                </div>
                {filteredSymbols.map((symbol) => (
                  <FilterItem
                    key={symbol}
                    label={symbol}
                    checked={!hiddenSymbols.has(symbol)}
                    onToggle={onToggleSymbol}
                  />
                ))}
              </div>
            )}

            {filteredExchanges.length === 0 && filteredSymbols.length === 0 && (
              <div className="filter-no-results">No tokens or exchanges match</div>
            )}
          </div>

          <div className="filter-footer">
            <button
              type="button"
              className="filter-reset-btn"
              onClick={() => {
                onResetFilters();
                setDropdownSearch('');
              }}
            >
              Reset All Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
