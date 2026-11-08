import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardPage } from './dashboard.page';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('DashboardPage', () => {
  let component: DashboardPage;
  let fixture: ComponentFixture<DashboardPage>;

  beforeEach(() => {
    localStorage.removeItem('finance-user');
    localStorage.removeItem('finance-resources');
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })),
    );
    fixture = TestBed.createComponent(DashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem('finance-user');
    localStorage.removeItem('finance-resources');
    vi.unstubAllGlobals();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads dashboard budgets from the budget endpoint and calculates spent amount', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            category_id: 4,
            budget_name: 'Food',
            budget_amount: '100.00',
            start_date: `${component.currentMonthKey}-01`,
            end_date: `${component.currentMonthKey}-28`,
            created_at: `${component.currentMonthKey}-01 00:00:00`,
          },
        ]),
        { status: 200 },
      ),
    );
    component.transactions = [
      {
        category_id: 4,
        transaction_type: 'Expense',
        amount: 25,
        transaction_date: `${component.currentMonthKey}-05`,
      },
    ];

    await component.loadBudgets(42);
    fixture.detectChanges();

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8000/budget/42');
    expect(component.activeMonthBudgets).toHaveLength(1);
    expect(component.getBudgetSpent(component.activeMonthBudgets[0])).toBe(25);
    expect(component.totalRemainingBudget).toBe(75);
    expect(fixture.nativeElement.textContent).toContain('Food');
  });

  it('shows recent budgets when none cover the current month', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            category_id: 4,
            budget_name: 'October Food Budget',
            budget_amount: '3000.00',
            start_date: '2026-10-01',
            end_date: '2026-10-31',
            created_at: '2026-10-30T00:00:00',
          },
        ]),
        { status: 200 },
      ),
    );
    component.currentMonthKey = '2026-11';

    await component.loadBudgets(42);
    fixture.detectChanges();

    expect(component.activeMonthBudgets).toHaveLength(0);
    expect(component.dashboardBudgets).toHaveLength(1);
    expect(component.budgetCardTitle).toBe('Recent Budgets');
    expect(fixture.nativeElement.textContent).toContain('October Food Budget');
    expect(fixture.nativeElement.textContent).toContain('2026-10-01 – 2026-10-31');
  });
});
