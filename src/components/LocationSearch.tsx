import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Search, Navigation, X, LocateFixed, Clock, Loader2 } from 'lucide-react';
import { searchLocations, SearchResult } from '../lib/locations';
import { useRecentLocationsStore } from '../stores/recentLocationsStore';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';

interface Props {
  label: string;
  value: string;
  onSelect: (result: { lat: number; lng: number; address: string }) => void;
  placeholder?: string;
  onPinClick?: () => void;
  pinActive?: boolean;
  onUseCurrentLocation?: () => void;
}

export default function LocationSearch({
  label, value, onSelect, placeholder,
  onPinClick, pinActive, onUseCurrentLocation,
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dk = useThemeStore(s => s.theme === 'dark');
  const recents = useRecentLocationsStore(s => s.recents);
  const addRecent = useRecentLocationsStore(s => s.addRecent);

  useEffect(() => { setQuery(value); }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced async search
  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!q || q.length < 2) {
      setResults([]);
      // If empty & focused, show the recents/location panel
      setShow(focused);
      setLoading(false);
      return;
    }

    setLoading(true);
    setShow(true);

    debounceRef.current = setTimeout(async () => {
      const r = await searchLocations(q);
      setResults(r);
      setShow(true);
      setLoading(false);
    }, 200);
  }, [focused]);

  const handleFocus = () => {
    setFocused(true);
    if (query && query.length >= 2 && results.length > 0) {
      setShow(true);
    } else {
      // Show recents/location panel when empty
      setShow(true);
    }
  };

  const handleSelect = (r: { lat: number; lng: number; address: string }) => {
    onSelect(r);
    addRecent(r);
    setQuery(r.address);
    setShow(false);
    setFocused(false);
  };

  // Should we show the "empty state" panel (Your Location + recents)?
  const showEmptyPanel = show && (!query || query.length < 2);
  const showResults = show && query && query.length >= 2;
  const hasAnyDropdown = showEmptyPanel || (showResults && (loading || results.length > 0));

  const hasQuery = !!query;
  const hasPin = !!onPinClick;
  const prClass = hasQuery && hasPin ? 'pr-[76px]' : hasQuery || hasPin ? 'pr-10' : 'pr-4';

  return (
    <div ref={ref} className="relative">
      <label className={cn('text-sm font-semibold mb-1.5 flex items-center gap-1.5', dk ? 'text-white/70' : 'text-gray-700')}>
        <MapPin size={14} className="text-brand" /> {label}
      </label>
      <div className="relative">
        <Search size={16} className={cn('absolute left-3 top-1/2 -translate-y-1/2 z-[1]', dk ? 'text-white/30' : 'text-gray-400')} />
        <input
          type="text" value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder || 'Search location...'}
          className={cn('w-full pl-10 py-3 rounded-xl text-sm border transition', prClass,
            dk ? 'bg-surface-dark-3 border-white/10 text-white placeholder:text-white/30'
               : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400'
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {hasQuery && (
            <button onClick={() => { setQuery(''); setResults([]); setShow(false); }}
              className={cn('p-1 rounded-md transition', dk ? 'text-white/30 hover:text-white/60' : 'text-gray-400 hover:text-gray-600')}>
              <X size={15} />
            </button>
          )}
          {hasPin && (
            <button onClick={onPinClick} title="Drop pin on map"
              className={cn('w-7 h-7 rounded-lg flex items-center justify-center transition',
                pinActive
                  ? 'bg-brand text-white shadow-sm'
                  : dk ? 'text-white/30 hover:bg-white/5 hover:text-white/60' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
              )}>
              <MapPin size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {hasAnyDropdown && (
        <div className={cn('absolute z-30 top-full mt-1 w-full rounded-xl shadow-xl border max-h-72 overflow-y-auto',
          dk ? 'bg-surface-dark-2 border-white/10' : 'bg-white border-gray-200')}>

          {/* Empty panel: Your Location + recents */}
          {showEmptyPanel && (
            <>
              {onUseCurrentLocation && (
                <button
                  onClick={() => { onUseCurrentLocation(); setShow(false); setFocused(false); }}
                  className={cn('w-full px-4 py-3 flex items-center gap-3 text-left transition border-b',
                    dk ? 'hover:bg-white/5 border-white/5' : 'hover:bg-gray-50 border-gray-100')}>
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    dk ? 'bg-info/10' : 'bg-blue-50')}>
                    <LocateFixed size={16} className="text-info" />
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold', dk ? 'text-white' : 'text-gray-900')}>Your Location</p>
                    <p className={cn('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>Use your current GPS position</p>
                  </div>
                </button>
              )}

              {recents.length > 0 && (
                <div className={cn('px-4 pt-2 pb-1', dk ? 'text-white/30' : 'text-gray-400')}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider">Recent</p>
                </div>
              )}
              {recents.map((r, i) => (
                <button key={`recent-${i}`}
                  onClick={() => handleSelect(r)}
                  className={cn('w-full px-4 py-2.5 flex items-start gap-3 text-left transition border-b last:border-0',
                    dk ? 'hover:bg-white/5 border-white/5' : 'hover:bg-gray-50 border-gray-100')}>
                  <Clock size={14} className={cn('mt-0.5 shrink-0', dk ? 'text-white/20' : 'text-gray-400')} />
                  <p className={cn('text-sm truncate', dk ? 'text-white/70' : 'text-gray-700')}>{r.address}</p>
                </button>
              ))}

              {!onUseCurrentLocation && recents.length === 0 && (
                <div className={cn('px-4 py-6 text-center text-sm', dk ? 'text-white/25' : 'text-gray-400')}>
                  Start typing to search...
                </div>
              )}
            </>
          )}

          {/* Search results */}
          {showResults && loading && (
            <div className={cn('px-4 py-6 flex items-center justify-center gap-2 text-sm',
              dk ? 'text-white/40' : 'text-gray-500')}>
              <Loader2 size={16} className="animate-spin" /> Searching...
            </div>
          )}
          {showResults && !loading && results.length === 0 && (
            <div className={cn('px-4 py-6 text-center text-sm', dk ? 'text-white/30' : 'text-gray-400')}>
              No results found
            </div>
          )}
          {showResults && !loading && results.map(r => (
            <button key={r.id}
              onClick={() => handleSelect({ lat: r.lat, lng: r.lng, address: r.name + (r.address !== r.name ? ', ' + r.address.replace(r.name + ', ', '') : '') })}
              className={cn('w-full px-4 py-3 flex items-start gap-3 text-left transition border-b last:border-0',
                dk ? 'hover:bg-white/5 border-white/5' : 'hover:bg-gray-50 border-gray-100')}>
              <Navigation size={16} className="text-brand mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className={cn('text-sm font-medium truncate', dk ? 'text-white' : 'text-gray-900')}>{r.name}</p>
                <p className={cn('text-xs truncate', dk ? 'text-white/40' : 'text-gray-500')}>{r.address}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
