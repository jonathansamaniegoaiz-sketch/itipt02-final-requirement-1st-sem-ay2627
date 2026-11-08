import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BudgetsPage } from './budgets.page';

vi.mock('chart.js', () => {
  class MockChart {
    static register(): void {}
    data: unknown;
    options: unknown;

    constructor(_canvas: HTMLCanvasElement, config: { data: unknown; options: unknown }) {
      this.data = config.data;
      this.options = config.options;
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

describe('BudgetsPage', () => {
  let component: BudgetsPage;
  let fixture: ComponentFixture<BudgetsPage>;

  beforeEach(() => {
    localStorage.setItem('finance-user', JSON.stringify({ user_id: 42 }));
    localStorage.setItem(
      'finance-resources',
      JSON.stringify({
        categories: [{ category_id: 3, category_name: 'Food' }],
        transactions: [
          {
            category_id: 3,
            transaction_type: 'Expense',
            amount: 25,
            transaction_date: '2026-11-10',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));
    fixture = TestBed.createComponent(BudgetsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('finance-user');
    localStorage.removeItem('finance-resources');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the budget endpoint array and calculates spending', async () => {
    const budgets = [
      {
        budget_id: 8,
        category_id: 3,
        budget_name: 'November Food',
        budget_amount: '100.00',
        start_date: '2026-11-01',
        end_date: '2026-11-30',
        created_at: '2026-11-01T10:00:00',
      },
    ];
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(budgets), { status: 200 }));

    await component.loadBudgets();

    expect(fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1:8000/budget/42');
    expect(component.budgets).toEqual(budgets);
    expect(component.getCategoryName(3)).toBe('Food');
    expect(component.getBudgetSpent(budgets[0])).toBe(25);
    expect(fixture.nativeElement.textContent).toContain('November Food');
  });

  it('renders budgets as a pie-chart legend and selected details instead of a table', async () => {
    const budgets = [
      {
        budget_id: 8,
        category_id: 3,
        budget_name: 'November Food',
        budget_amount: '100.00',
        start_date: '2026-11-01',
        end_date: '2026-11-30',
        created_at: '2026-11-01T10:00:00',
      },
    ];
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(budgets), { status: 200 }));

    await component.loadBudgets();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('canvas[role="img"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.budget-legend-item')?.textContent).toContain('November Food');
    expect(fixture.nativeElement.querySelector('.selected-budget')?.textContent).toContain('Spent');
    expect(fixture.nativeElement.querySelector('[role="table"]')).toBeNull();
  });

  it('reloads budgets when returning to the cached Ionic page', async () => {
    const fetchMock = vi.mocked(fetch);
    await component.loadBudgets();
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    component.ionViewWillEnter();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/budget/42');
  });

  it('creates a budget through the backend and updates the list', async () => {
    const createdBudget = {
      budget_id: 9,
      category_id: 3,
      budget_name: 'New Food Budget',
      budget_amount: 200,
      start_date: '2026-11-01',
      end_date: '2026-11-30',
      created_at: '2026-11-01T10:00:00',
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(createdBudget), { status: 201 }));
    component.userId = 42;
    component.newBudget = {
      ...createdBudget,
      budget_id: undefined,
      budget_name: ' New Food Budget ',
    };

    await component.saveBudget();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/budgets',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(component.budgets).toContainEqual(createdBudget);
    expect(component.showForm).toBe(false);
  });

  it('updates and deletes a budget using its ID', async () => {
    const budget = {
      budget_id: 8,
      category_id: 3,
      budget_name: 'Food',
      budget_amount: 100,
      start_date: '2026-11-01',
      end_date: '2026-11-30',
      created_at: '2026-11-01T10:00:00',
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...budget, budget_amount: 150 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    component.userId = 42;
    component.budgets = [budget];
    component.beginEdit(budget);
    component.newBudget.budget_amount = 150;

    await component.saveBudget();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8000/budgets/42/8',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(component.budgets[0].budget_amount).toBe(150);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await component.deleteBudget(component.budgets[0]);

    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:8000/budgets/42/8', { method: 'DELETE' });
    expect(component.budgets).toEqual([]);
  });
});
