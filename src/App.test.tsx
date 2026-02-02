import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value.toString(); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; }
    };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock
});

describe('Typing Speed Trainer', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('renders without crashing', () => {
        render(<App />);
        expect(screen.getByText(/TYPO/i)).toBeInTheDocument();
    });

    it('displays high score when available', () => {
        // Set high score in localStorage before rendering
        localStorage.setItem('typing-high-score', JSON.stringify({
            wpm: 100,
            accuracy: 95,
            date: new Date().toISOString()
        }));

        render(<App />);
        expect(screen.getByText(/100 WPM/i)).toBeInTheDocument();
    });

    it('has proper ARIA labels for accessibility', () => {
        render(<App />);

        // Check for application role
        expect(screen.getByRole('application', { name: /typing speed test/i })).toBeInTheDocument();

        // Check for instructions
        expect(screen.getByText(/Type the words as they appear/i)).toBeInTheDocument();
    });

    it('can reset the test', () => {
        render(<App />);

        const resetButton = screen.getByLabelText(/Reset test/i);
        expect(resetButton).toBeInTheDocument();
    });
});
