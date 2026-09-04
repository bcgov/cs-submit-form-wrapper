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

  // The button shipped inert once: it called onChange with the value already in state, which is a
  // React no-op. Both paths ahead of the caller's debounce are pinned here.
  it('searches on the button', async () => {
    const onSubmit = vi.fn();
    render(
      <ListPageSearchField
        value="pay"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        testIdPrefix="forms"
        showSearchButton
      />,
    );

    await userEvent.setup().click(screen.getByTestId('search-forms-button'));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('searches on Enter', async () => {
    const onSubmit = vi.fn();
    render(
      <ListPageSearchField
        value="pay"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        testIdPrefix="forms"
      />,
    );

    const input = screen.getByTestId('search-forms-text').querySelector('input') as HTMLInputElement;
    await userEvent.setup().type(input, '{Enter}');
    expect(onSubmit).toHaveBeenCalled();
  });
});
