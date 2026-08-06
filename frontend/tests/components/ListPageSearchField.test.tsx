import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListPageSearchField } from '@/src/components/ListPageSearchField';

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({ locale: 'en', general: { search: 'Search' } }),
}));

describe('ListPageSearchField', () => {
  it('renders search input', async () => {
    const onChange = vi.fn();
    render(<ListPageSearchField value="team" onChange={onChange} testIdPrefix="workspaces" />);

    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByTestId('search-workspaces-text')).toBeInTheDocument();
  });

  it('does not show clear button when empty', () => {
    render(<ListPageSearchField value="" onChange={vi.fn()} testIdPrefix="forms" />);
    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
  });
});
