'use client';

import { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { isValidEmail } from '@/lib/utils';

interface MultiEmailInputProps {
  value: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MultiEmailInput({ value, onChange, placeholder = 'Enter email address', disabled }: MultiEmailInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addEmail = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;

    if (!isValidEmail(trimmed)) {
      setError(`Invalid email: ${trimmed}`);
      return;
    }

    if (value.includes(trimmed)) {
      setError('Email already added');
      return;
    }

    onChange([...value, trimmed]);
    setInputValue('');
    setError(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail(inputValue);
    }
    // Allow backspace to remove last email when input is empty
    if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes(',') || pasted.includes(';') || pasted.includes('\n')) {
      e.preventDefault();
      const emails = pasted
        .split(/[,;\n]/)
        .map(e => e.trim())
        .filter(e => e);
      const validEmails = emails.filter(e => isValidEmail(e) && !value.includes(e));
      if (validEmails.length > 0) {
        onChange([...value, ...validEmails]);
      }
    }
  };

  const removeEmail = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className={`flex flex-wrap gap-2 p-2 border rounded-md min-h-[42px] bg-white ${disabled ? 'bg-gray-100' : ''}`}>
        {value.map((email, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
          >
            {email}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeEmail(index)}
                className="hover:text-blue-600 focus:outline-none"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <input
          type="email"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            if (inputValue) addEmail(inputValue);
          }}
          placeholder={value.length === 0 ? placeholder : 'Add another...'}
          disabled={disabled}
          className="flex-1 min-w-[200px] outline-none border-none bg-transparent text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="text-xs text-gray-500">Press Enter or comma to add. Paste comma-separated emails.</p>
    </div>
  );
}
