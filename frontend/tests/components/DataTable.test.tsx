import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DataTable } from '@/src/components/DataTable';

type Item = { id: string; name: string; value?: number };

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'value', label: 'Value', render: (it: Item) => <strong>{it.value ?? '-'}</strong> },
];

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({
    locale: 'en',
    dataTable: {
      emptyMessage: 'No items found.',
      loadingMessage: 'Loading...',
      pageOf: 'of {totalPages} page(s)',
    },
  }),
}));

describe('DataTable', () => {
  it('renders empty message when no data', () => {
    render(<DataTable<Item> data={[]} columns={columns} keyExtractor={(i) => i.id} />);

    expect(screen.getByText('No items found.')).toBeInTheDocument();
  });

  // Callers pass a sentence written for the reader. A prefix turned "Your session has ended. Please
  // sign in again." into something that reads like a stack trace.
  it('shows the error a caller passed, and nothing else', () => {
    render(
      <DataTable<Item>
        data={[]}
        columns={columns}
        keyExtractor={(i) => i.id}
        error="Your session has ended. Please sign in again."
      />,
    );

    const cell = screen.getByTestId('datatable-error');
    expect(cell).toHaveTextContent('Your session has ended. Please sign in again.');
    expect(cell.textContent).not.toMatch(/Error:/);
    expect(screen.queryByText('No items found.')).not.toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <DataTable<Item>
        data={[]}
        columns={columns}
        loading
        loadingMessage="Please wait..."
        keyExtractor={(i) => i.id}
      />,
    );

    // No visible loading text by design — the spinner carries the message as its
    // screen-reader accessible name (aria-label) inside a role="status" region.
    expect(screen.getByRole('progressbar', { name: 'Please wait...' })).toBeInTheDocument();
  });

  it('renders rows and calls paging callbacks', async () => {
    const data: Item[] = [
      { id: 'a1', name: 'Alice', value: 1 },
      { id: 'b2', name: 'Bob', value: 2 },
    ];
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();

    render(
      <DataTable<Item>
        data={data}
        columns={columns}
        totalItems={2}
        pageSize={1}
        currentPage={1}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        keyExtractor={(i) => i.id}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();

    const user = userEvent.setup();

    await user.click(screen.getByTestId('datatable-next-page-button'));
    expect(onPageChange).toHaveBeenCalled();

    // DS Select is a button + popup listbox (not a native <select>): open it,
    // then pick an option.
    const pageSizeSelect = screen.getByTestId('datatable-page-size-select');
    await user.click(within(pageSizeSelect).getByRole('button'));
    await user.click(await screen.findByRole('option', { name: '10' }));
    expect(onPageSizeChange).toHaveBeenCalled();
  });
});
