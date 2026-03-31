import { useState, useRef, useEffect } from 'react';

interface AutocompleteItem {
  id: string;
  name: string;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: AutocompleteItem) => void;
  items: AutocompleteItem[];
  placeholder: string;
  required?: boolean;
  className?: string;
}

export default function AutocompleteInput({
  value,
  onChange,
  onSelect,
  items,
  placeholder,
  required = false,
  className = '',
}: AutocompleteInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredItems = value.trim() === ''
    ? []
    : items.filter((item) =>
        item.name.toLowerCase().includes(value.toLowerCase())
      );

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter' && showSuggestions) {
      e.preventDefault();
      handleSelect(filteredItems[selectedIndex]);
    }
  };

  const handleSelect = (item: AutocompleteItem) => {
    onChange(item.name);
    setShowSuggestions(false);
    if (onSelect) {
      onSelect(item);
    }
  };

  const handleFocus = () => {
    if (value.trim()) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    setTimeout(() => setShowSuggestions(false), 200);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setShowSuggestions(e.target.value.trim() !== '');
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={className}
        required={required}
      />
      {showSuggestions && filteredItems.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-gray-700 rounded-lg border border-gray-600 max-h-60 overflow-y-auto z-10 shadow-xl">
          {filteredItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              className={`w-full text-left px-4 py-3 text-white border-b border-gray-600 last:border-b-0 transition-colors ${
                index === selectedIndex ? 'bg-gray-600' : 'hover:bg-gray-600'
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
