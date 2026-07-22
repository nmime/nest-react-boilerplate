import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiPagination } from './pagination';

describe('UiPagination branch coverage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('navigates to the previous page when the control is enabled', () => {
    const onPageChange = vi.fn();

    render(<UiPagination currentPage={3} onPageChange={onPageChange} totalPages={5} />);

    const previous = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Go to previous page',
    });
    expect(previous.disabled).toBe(false);
    fireEvent.click(previous);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('summarizes empty ranges, page-only mode, and missing totals', () => {
    const { rerender } = render(
      <UiPagination currentPage={1} onPageChange={vi.fn()} pageSize={10} totalItems={0} totalPages={1} />,
    );
    expect(screen.getByText('0-0 of 0')).toBeTruthy();

    rerender(<UiPagination currentPage={2} onPageChange={vi.fn()} totalPages={3} />);
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();

    rerender(<UiPagination currentPage={1} onPageChange={vi.fn()} pageSize={10} totalPages={2} />);
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
  });

  it('accepts localized visible, summary, and accessible labels', () => {
    render(
      <UiPagination
        currentPage={1}
        label="Пагинация"
        nextAriaLabel="Перейти на следующую страницу"
        nextLabel="Вперёд"
        onPageChange={vi.fn()}
        pageAriaLabel={(page) => `Перейти на страницу ${page}`}
        previousAriaLabel="Перейти на предыдущую страницу"
        previousLabel="Назад"
        summary="1-10 из 11"
        totalPages={2}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Пагинация' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Перейти на предыдущую страницу' }).textContent).toBe('Назад');
    expect(screen.getByRole('button', { name: 'Перейти на следующую страницу' }).textContent).toBe('Вперёд');
    expect(screen.getByRole('button', { name: 'Перейти на страницу 2' })).toBeTruthy();
    expect(screen.getByText('1-10 из 11')).toBeTruthy();
  });
});
