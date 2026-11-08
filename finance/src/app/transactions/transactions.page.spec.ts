import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionsPage } from './transactions.page';

vi.mock('chart.js', () => {
  class MockChart {
    static register(): void {}
    data: unknown;

    constructor(_canvas: HTMLCanvasElement, config: { data: unknown }) {
      this.data = config.data;
    }

    update(): void {}
    destroy(): void {}
  }

  return {
    ArcElement: {},
    Chart: MockChart,
    Legend: {},
    PieController: {},
    Tooltip: {},
  };
});

describe('TransactionsPage', () => {
  let component: TransactionsPage;
  let fixture: ComponentFixture<TransactionsPage>;

  beforeEach(() => {
    localStorage.removeItem('finance-user');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
    fixture = TestBed.createComponent(TransactionsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('finance-user');
    vi.unstubAllGlobals();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requests the selected ordering and preserves the active type filter', async () => {
    const transactions = [
      {
        transaction_type: 'Expense',
        amount: 40,
        description: 'Groceries',
        transaction_date: '2026-01-02',
        notes: null,
      },
      {
        transaction_type: 'Income',
        amount: 500,
        description: 'Salary',
        transaction_date: '2026-01-01',
        notes: null,
      },
    ];
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(transactions), { status: 200 }));
    component.userID = '42';
    component.activeFilter = 'expenseBtn';

    await component.orderTransactions('highest');

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/transactionFilter/42/true/highest');
    expect(component.transaction).toEqual([transactions[0]]);
  });

  it('searches through the backend and keeps the selected type filter', async () => {
    const transactions = [
      {
        transaction_type: 'Expense',
        amount: 40,
        description: 'Groceries',
        transaction_date: '2026-01-02',
        notes: 'Weekly shopping',
      },
      {
        transaction_type: 'Income',
        amount: 500,
        description: 'Salary',
        transaction_date: '2026-01-01',
        notes: null,
      },
    ];
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(transactions), { status: 200 }));
    component.userID = '42';
    component.activeFilter = 'expenseBtn';
    component.searchTerm = 'weekly shopping';

    await component.searchTransactions();

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/transactionSearch/42?search_term=weekly%20shopping');
    expect(component.transaction).toEqual([transactions[0]]);
  });

  it('shows a pie chart and total rows for each type, independent of the selected list filter', async () => {
    const transactions = [
      {
        transaction_type: 'Expense',
        amount: 40,
        description: 'Groceries',
        transaction_date: '2026-01-02',
        notes: null,
      },
      {
        transaction_type: 'Income',
        amount: 500,
        description: 'Salary',
        transaction_date: '2026-01-01',
        notes: null,
      },
      {
        transaction_type: 'Expense',
        amount: 10,
        description: 'Coffee',
        transaction_date: '2026-01-03',
        notes: null,
      },
    ];
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(transactions), { status: 200 }));
    component.userID = '42';
    component.activeFilter = 'expenseBtn';

    await component.filterTransactions('expenseBtn');
    fixture.detectChanges();

    expect(component.transaction).toHaveLength(2);
    expect(component.transactionTypeTotals).toEqual([
      { type: 'Expense', amount: 50, count: 2 },
      { type: 'Income', amount: 500, count: 1 },
    ]);
    expect(component.totalTransactionAmount).toBe(550);
    expect(
      fixture.nativeElement.querySelector('canvas[aria-label="Pie chart of transaction totals by type"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.type-total-rows')?.textContent).toContain('₱50.00');
    expect(fixture.nativeElement.querySelector('.type-total-rows')?.textContent).toContain('₱500.00');
  });

  it('displays transaction notes and a fallback when notes are missing', () => {
    component.loadError = '';
    component.transaction = [
      {
        transaction_type: 'Expense',
        amount: 40,
        description: 'Groceries',
        transaction_date: '2026-01-02',
        notes: 'Weekly shopping',
      },
      {
        transaction_type: 'Income',
        amount: 500,
        description: 'Salary',
        transaction_date: '2026-01-01',
        notes: null,
      },
    ];
    fixture.detectChanges();

    const table = fixture.nativeElement.querySelector('.transaction-table') as HTMLTableElement;

    expect(table.textContent).toContain('Notes');
    expect(table.textContent).toContain('Weekly shopping');
    expect(table.textContent).toContain('No notes');
    expect(fixture.nativeElement.querySelector('[aria-label="Edit transaction"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Archive transaction"]')).not.toBeNull();
  });
});
