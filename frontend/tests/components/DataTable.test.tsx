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
        totalItems={20}
        pageSize={5}
        currentPage={1}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        keyExtractor={(i) => i.id}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();

    const user = userEvent.setup();

    await user.click(screen.getByTestId('datatable-next-page-button'));
    expect(onPageChange).toHaveBeenCalledWith(2);

    // DS Select is a button + popup listbox (not a native <select>): open it,
    // then pick an option.
    const pageSizeSelect = screen.getByTestId('datatable-page-size-select');
    await user.click(within(pageSizeSelect).getByRole('button'));
    await user.click(await screen.findByRole('option', { name: '10' }));
    expect(onPageSizeChange).toHaveBeenCalledWith(10);
  });

  // The page count comes from the server total, not from the rows on screen.
  it('pages against the total, not the rows it was handed', () => {
    render(
      <DataTable<Item>
        data={[{ id: 'a1', name: 'Alice' }]}
        columns={columns}
        totalItems={137}
        pageSize={10}
        currentPage={7}
        onPageChange={vi.fn()}
        keyExtractor={(i) => i.id}
      />,
    );

    expect(screen.getByText('of 14 page(s)')).toBeInTheDocument();
    expect(screen.getByText(/61 - 70/)).toBeInTheDocument();
  });

  it('clamps a page past the end and tells the caller', () => {
    const onPageChange = vi.fn();
    render(
      <DataTable<Item>
        data={[]}
        columns={columns}
        totalItems={8}
        pageSize={10}
        currentPage={5}
        onPageChange={onPageChange}
        keyExtractor={(i) => i.id}
      />,
    );

    expect(onPageChange).toHaveBeenCalledWith(1);
    expect(screen.getByText('of 1 page(s)')).toBeInTheDocument();
    expect(screen.getByText(/1 - 8/)).toBeInTheDocument();
  });

  // Before the first response every page looks past the end; clamping then would strand a deep link
  // on page one.
  it('does not clamp before the total is known', () => {
    const onPageChange = vi.fn();
    render(
      <DataTable<Item>
        data={[]}
        columns={columns}
        pageSize={10}
        currentPage={7}
        loading
        onPageChange={onPageChange}
        keyExtractor={(i) => i.id}
      />,
    );

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('leaves a page inside the range alone', () => {
    const onPageChange = vi.fn();
    render(
      <DataTable<Item>
        data={[{ id: 'a1', name: 'Alice' }]}
        columns={columns}
        totalItems={80}
        pageSize={10}
        currentPage={5}
        onPageChange={onPageChange}
        keyExtractor={(i) => i.id}
      />,
    );

    expect(onPageChange).not.toHaveBeenCalled();
  });

  // Retained rows from the previous page would otherwise hide the failure entirely.
  it('shows the error even when it still holds rows', () => {
    render(
      <DataTable<Item>
        data={[{ id: 'a1', name: 'Alice' }]}
        columns={columns}
        totalItems={20}
        pageSize={10}
        currentPage={1}
        error="Request failed"
        onPageChange={vi.fn()}
        keyExtractor={(i) => i.id}
      />,
    );

    expect(screen.getByText('Request failed')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    // The paging controls survive, so there is a way back from the failed page.
    expect(screen.getByTestId('datatable-prev-page-button')).toBeInTheDocument();
  });

  it('falls back to an offered page size when handed one that is not', () => {
    render(
      <DataTable<Item>
        data={[{ id: 'a1', name: 'Alice' }]}
        columns={columns}
        totalItems={20}
        pageSize={7}
        currentPage={1}
        pageSizeOptions={[5, 10]}
        onPageChange={vi.fn()}
        keyExtractor={(i) => i.id}
      />,
    );

    expect(screen.getByText('of 4 page(s)')).toBeInTheDocument();
  });

  describe('sortable headers', () => {
    const sortableColumns = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name', sortField: 'name' },
      { key: 'value', label: 'Value', sortField: 'createdAt', sortDefaultDirection: 'desc' as const },
    ];

    const renderSortable = (sort: string, onSortChange = vi.fn()) => {
      render(
        <DataTable<Item>
          data={[{ id: 'a1', name: 'Alice' }]}
          columns={sortableColumns}
          sort={sort}
          onSortChange={onSortChange}
          keyExtractor={(i) => i.id}
        />,
      );
      return onSortChange;
    };

    it('marks only the active column, and only in the direction in force', () => {
      renderSortable('name:asc');

      expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
        'aria-sort',
        'ascending',
      );
      expect(screen.getByRole('columnheader', { name: /Value/ })).toHaveAttribute(
        'aria-sort',
        'none',
      );
      // Not sortable, so it carries no sort state at all.
      expect(screen.getByRole('columnheader', { name: 'ID' })).not.toHaveAttribute('aria-sort');
    });

    it('flips direction on the column already sorted', async () => {
      const onSortChange = renderSortable('name:asc');
      await userEvent.setup().click(screen.getByTestId('datatable-sort-name'));
      expect(onSortChange).toHaveBeenCalledWith('name:desc');
    });

    it('opens a new column in the direction it declares', async () => {
      const onSortChange = renderSortable('name:asc');
      await userEvent.setup().click(screen.getByTestId('datatable-sort-value'));
      expect(onSortChange).toHaveBeenCalledWith('createdAt:desc');
    });

    it('leaves headers inert without a sort handler', () => {
      render(
        <DataTable<Item>
          data={[{ id: 'a1', name: 'Alice' }]}
          columns={sortableColumns}
          keyExtractor={(i) => i.id}
        />,
      );

      expect(screen.queryByTestId('datatable-sort-name')).not.toBeInTheDocument();
    });
  });
});
