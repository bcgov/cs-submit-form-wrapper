import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({ locale: 'en', workspaces: { workspace: 'Workspace' } }),
}));
import { PageLayout } from '@/src/components/PageLayout';
import { usePageHeading, usePageNotices } from '@/src/components/PageHeader';

function Child({ heading, eyebrow }: { heading?: string; eyebrow?: string }) {
  usePageHeading({ heading, eyebrow });
  return <p>body</p>;
}

function Togglable() {
  const [mounted, setMounted] = useState(true);
  return (
    <PageLayout headingId="page-heading" heading="From the page">
      {mounted ? <Child heading="From the client" eyebrow="Workspace A" /> : <p>body</p>}
      <button onClick={() => setMounted(false)}>unmount</button>
    </PageLayout>
  );
}

describe('PageLayout heading', () => {
  it('renders the page heading when nothing registers', () => {
    render(
      <PageLayout headingId="page-heading" heading="From the page">
        <p>body</p>
      </PageLayout>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'From the page' })).toBeInTheDocument();
  });

  it('lets a client child replace the heading and add an eyebrow', () => {
    render(<Togglable />);
    expect(screen.getByRole('heading', { level: 1, name: 'From the client' })).toBeInTheDocument();
    expect(screen.getByText('Workspace A')).toBeInTheDocument();
  });

  it('restores the page heading when the child unmounts', async () => {
    const { getByRole } = render(<Togglable />);
    await act(async () => {
      getByRole('button', { name: 'unmount' }).click();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'From the page' })).toBeInTheDocument();
    expect(screen.queryByText('Workspace A')).not.toBeInTheDocument();
  });

  it('omits the heading block entirely when no heading is set', () => {
    const { container } = render(
      <PageLayout headingId="page-heading">
        <p>body</p>
      </PageLayout>,
    );
    expect(container.querySelector('h1')).toBeNull();
  });
});

function Notices({ show }: { show: boolean }) {
  usePageNotices([
    show && { id: 'disclaimer', variant: 'warning' as const, body: 'Accept the disclaimer' },
    { id: 'broken', variant: 'danger' as const, body: 'Something failed' },
  ]);
  return <p>body</p>;
}

/** The notice text never changes, so a captured callback would keep the count it was created with. */
function StaleAction() {
  const [count, setCount] = useState(0);
  const [seen, setSeen] = useState<number | null>(null);
  usePageNotices([
    {
      id: 'act',
      variant: 'info' as const,
      body: 'Fixed text',
      action: { label: 'run', onPress: () => setSeen(count) },
    },
  ]);
  return (
    <>
      <button onClick={() => setCount((c) => c + 1)}>bump</button>
      <p>seen: {seen === null ? 'none' : seen}</p>
    </>
  );
}

describe('PageLayout notices', () => {
  it('renders declared notices with a derived test id and drops falsy entries', () => {
    render(
      <PageLayout headingId="page-heading" heading="Page">
        <Notices show={false} />
      </PageLayout>,
    );
    expect(screen.queryByTestId('page-notice-disclaimer')).not.toBeInTheDocument();
    expect(screen.getByTestId('page-notice-broken')).toBeInTheDocument();
  });

  it('marks only danger notices as alerts', () => {
    render(
      <PageLayout headingId="page-heading" heading="Page">
        <Notices show={true} />
      </PageLayout>,
    );
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Something failed');
  });

  it('runs the action against current state, not the state it was registered with', async () => {
    render(
      <PageLayout headingId="page-heading" heading="Page">
        <StaleAction />
      </PageLayout>,
    );
    await act(async () => {
      screen.getByRole('button', { name: 'bump' }).click();
    });
    await act(async () => {
      screen.getByRole('button', { name: 'run' }).click();
    });
    expect(screen.getByText('seen: 1')).toBeInTheDocument();
  });
});
