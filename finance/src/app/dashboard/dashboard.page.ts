import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonProgressBar,
} from '@ionic/angular';
import { RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { pieChartOutline, trendingDownOutline, trendingUpOutline, walletOutline } from 'ionicons/icons';

interface DashboardBudget {
  category_id: number | string;
  budget_name: string;
  budget_amount: number | string;
  start_date: string;
  end_date: string;
  created_at: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  imports: [
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonButton,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonProgressBar,
    RouterLink,
    CommonModule,
  ],
})
export class DashboardPage implements OnInit {
  currentMonth = '';
  currentYear = '';
  currentTime = '';
  greeting = '';
  // User
  user: any = null;

  // Dashboard resources
  totalBalance: number = 0;
  totalIncome: number = 0;
  totalExpenses: number = 0;
  totalRemainingBudget: number = 0;

  // Database tables
  accounts: any[] = [];
  bills: any[] = [];
  budgets: DashboardBudget[] = [];
  budgetLoading = false;
  budgetLoadError = '';
  categories: any[] = [];
  goalContributions: any[] = [];
  notifications: any[] = [];
  recurringTransactions: any[] = [];
  savingsGoals: any[] = [];
  transactions: any[] = [];
  currentMonthKey = '';
  currentDateKey = '';

  get recentTransactions(): any[] {
    return [...this.transactions]
      .sort((first, second) => String(second.transaction_date).localeCompare(String(first.transaction_date)))
      .slice(0, 3);
  }

  get upcomingBills(): any[] {
    return this.bills
      .filter((bill) => bill.status === 'Pending' && String(bill.due_date) >= this.currentDateKey)
      .sort((first, second) => String(first.due_date).localeCompare(String(second.due_date)))
      .slice(0, 3);
  }

  get activeMonthBudgets(): DashboardBudget[] {
    return this.budgets
      .filter(
        (budget) =>
          String(budget.start_date).slice(0, 7) <= this.currentMonthKey &&
          String(budget.end_date).slice(0, 7) >= this.currentMonthKey,
      )
      .slice(0, 3);
  }

  get dashboardBudgets(): DashboardBudget[] {
    if (this.activeMonthBudgets.length > 0) {
      return this.activeMonthBudgets;
    }

    return [...this.budgets]
      .sort((first, second) => String(second.created_at).localeCompare(String(first.created_at)))
      .slice(0, 3);
  }

  get budgetCardTitle(): string {
    return this.activeMonthBudgets.length > 0 ? "This Month's Budgets" : 'Recent Budgets';
  }

  getBudgetSpent(budget: any): number {
    return this.transactions
      .filter(
        (transaction) =>
          transaction.transaction_type === 'Expense' &&
          Number(transaction.category_id) === Number(budget.category_id) &&
          transaction.transaction_date >= budget.start_date &&
          transaction.transaction_date <= budget.end_date,
      )
      .reduce((total, transaction) => total + Number(transaction.amount ?? 0), 0);
  }

  getBudgetProgress(budget: any): number {
    const budgetAmount = Number(budget.budget_amount);
    return budgetAmount > 0 ? Math.min(this.getBudgetSpent(budget) / budgetAmount, 1) : 0;
  }

  getGoalSavedAmount(goal: any): number {
    return this.goalContributions
      .filter((contribution) => Number(contribution.goal_id) === Number(goal.goal_id))
      .reduce((total, contribution) => total + Number(contribution.amount ?? 0), 0);
  }

  getGoalProgress(goal: any): number {
    const targetAmount = Number(goal.target_amount);
    return targetAmount > 0 ? Math.min(this.getGoalSavedAmount(goal) / targetAmount, 1) : 0;
  }

  constructor(private readonly changeDetector: ChangeDetectorRef) {
    addIcons({
      pieChartOutline,
      trendingDownOutline,
      trendingUpOutline,
      walletOutline,
    });
  }

  ngOnInit(): void {
    const now = new Date();
    this.currentMonthKey = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      timeZone: 'Asia/Manila',
    }).format(now);
    this.currentDateKey = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Manila',
    }).format(now);
    const manilaHour = Number(
      new Intl.DateTimeFormat('en-PH', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: 'Asia/Manila',
      }).format(now),
    );

    if (manilaHour >= 5 && manilaHour < 12) {
      this.greeting = 'Good morning';
    } else if (manilaHour >= 12 && manilaHour < 18) {
      this.greeting = 'Good afternoon';
    } else {
      this.greeting = 'Good evening';
    }

    this.currentMonth = now.toLocaleString('en-PH', {
      month: 'long',
      timeZone: 'Asia/Manila',
    });

    this.currentYear = now.toLocaleString('en-PH', {
      year: 'numeric',
      timeZone: 'Asia/Manila',
    });

    this.currentTime = now.toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila',
    });

    const savedUser = localStorage.getItem('finance-user');
    const savedResources = localStorage.getItem('finance-resources');

    this.user = savedUser ? JSON.parse(savedUser) : null;

    const resources = savedResources ? JSON.parse(savedResources) : null;

    // Dashboard resources
    this.totalBalance = Number(resources?.accounts?.[0]?.balance ?? 0);
    this.totalIncome = (resources?.transactions ?? [])
      .filter((transaction: { transaction_type: string }) => transaction.transaction_type === 'Income')
      .reduce((total: number, transaction: { amount: number | string }) => total + Number(transaction.amount ?? 0), 0);
    this.totalExpenses = (resources?.transactions ?? [])
      .filter((transaction: { transaction_type: string }) => transaction.transaction_type === 'Expense')
      .reduce((total: number, transaction: { amount: number | string }) => total + Number(transaction.amount ?? 0), 0);
    // Database tables
    this.accounts = resources?.accounts ?? [];
    this.bills = resources?.bills ?? [];
    this.budgets = resources?.budgets ?? [];
    this.categories = resources?.categories ?? [];
    this.goalContributions = resources?.goal_contributions ?? [];
    this.notifications = resources?.notifications ?? [];
    this.recurringTransactions = resources?.recurringTransactions ?? [];
    this.savingsGoals = resources?.savings_goals ?? [];
    this.transactions = resources?.transactions ?? [];
    this.updateTotalRemainingBudget();

    if (this.user?.user_id) {
      void this.loadBudgets(this.user.user_id);
    }
  }

  async loadBudgets(userId: number | string): Promise<void> {
    this.budgetLoading = true;
    this.budgetLoadError = '';

    try {
      const response = await fetch(`http://127.0.0.1:8000/budget/${encodeURIComponent(userId)}`);
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      this.budgets = await response.json();
      this.updateTotalRemainingBudget();
    } catch (error) {
      this.budgetLoadError =
        error instanceof Error ? error.message : 'Could not load dashboard budgets.';
      console.error('Failed to load dashboard budgets:', error);
    } finally {
      this.budgetLoading = false;
      this.changeDetector.detectChanges();
    }
  }

  private updateTotalRemainingBudget(): void {
    this.totalRemainingBudget = this.activeMonthBudgets.reduce((budgetTotal, budget) => {
      const spent = this.transactions
        .filter(
          (transaction) =>
            transaction.transaction_type === 'Expense' &&
            Number(transaction.category_id) === Number(budget.category_id) &&
            transaction.transaction_date >= budget.start_date &&
            transaction.transaction_date <= budget.end_date,
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

      return budgetTotal + Number(budget.budget_amount) - spent;
    }, 0);
  }
}
