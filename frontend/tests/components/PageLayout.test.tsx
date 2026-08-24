import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({ locale: 'en', workspaces: { workspace: 'Workspace' } }),
}));
import { PageLayout } from '@/src/components/PageLayout';
import { usePageHeading } from '@/src/components/PageHeader';

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
