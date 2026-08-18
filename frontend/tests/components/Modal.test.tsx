import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from '@/src/components/Modal';

vi.mock('@/app/[lang]/Providers', () => ({
  useDictionary: () => ({ locale: 'en', modal: { dialogActions: 'Dialog actions' } }),
}));

describe('Modal Component', () => {
  it('renders nothing when show is false', () => {
    render(
      <Modal show={false} title="Test Title" onClose={vi.fn()}>
        <div>Modal Content</div>
      </Modal>,
    );

    expect(screen.queryByText('Test Title')).not.toBeInTheDocument();
    expect(screen.queryByText('Modal Content')).not.toBeInTheDocument();
  });

  it('renders content when show is true', () => {
    render(
      <Modal show={true} title="Visible Title" onClose={vi.fn()}>
        <div>Visible Content</div>
      </Modal>,
    );

    expect(screen.getByText('Visible Title')).toBeInTheDocument();
    expect(screen.getByText('Visible Content')).toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    render(
      <Modal
        show={true}
        title="Footer Test"
        onClose={vi.fn()}
        footer={<button>Footer Button</button>}
      >
        <div>Content</div>
      </Modal>,
    );

    expect(screen.getByRole('button', { name: 'Footer Button' })).toBeInTheDocument();
  });
});
