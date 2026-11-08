import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, ViewChild } from '@angular/core';
import type { ElementRef, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonIcon,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular';
import { ArcElement, Chart, Legend, PieController, Tooltip } from 'chart.js';
import { addIcons } from 'ionicons';
import { archiveOutline, createOutline, ellipsisVertical, searchCircle, swapVertical } from 'ionicons/icons';

interface Transaction {
  transaction_type: string;
  amount: number | string;
  description: string;
  transaction_date: string;
  notes: string | null;
}

type TransactionOrder = 'new' | 'old' | 'A-Z' | 'Z-A' | 'highest' | 'lowest';

const ORDER_API_VALUES: Record<TransactionOrder, string> = {
  new: 'newest',
  old: 'oldest',
  'A-Z': 'a-z',
  'Z-A': 'z-a',
  highest: 'highest',
  lowest: 'lowest',
};

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonIcon,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
  ],
})
export class TransactionsPage implements OnInit, OnDestroy {
  private readonly changeDetector = inject(ChangeDetectorRef);
  user: any = null;
  userID: string | null = null;
  transaction: Transaction[] = [];
  private summaryTransactions: Transaction[] = [];
  private typeChart?: Chart<'pie', number[], string>;
  private readonly chartColors = ['#2679e8', '#e64b66', '#8d4ed8', '#17a879', '#e58a31', '#4b647e'];
  transactionAPI = '';
  transaction_type: TransactionOrder = 'new';
  activeFilter = 'allBtn';
  searchTerm = '';
  loadError = '';
  isLoading = false;
  private requestSequence = 0;

  constructor() {
    addIcons({ archiveOutline, createOutline, ellipsisVertical, searchCircle, swapVertical });
    Chart.register(PieController, ArcElement, Tooltip, Legend);
  }

  @ViewChild('transactionTypeChart')
  set transactionTypeChartElement(element: ElementRef<HTMLCanvasElement> | undefined) {
    if (!element) {
      this.typeChart?.destroy();
      this.typeChart = undefined;
      return;
    }

    this.typeChart = new Chart<'pie', number[], string>(element.nativeElement, {
      type: 'pie',
      data: {
        labels: [],
        datasets: [{ data: [], backgroundColor: [], borderColor: '#ffffff', borderWidth: 3, hoverOffset: 7 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = this.transactionTypeTotals[context.dataIndex];
                return total ? `${total.type}: ${this.formatCurrency(total.amount)} (${total.count})` : '';
              },
            },
          },
        },
      },
    });
    this.updateTypeChart();
  }

  ngOnDestroy(): void {
    this.typeChart?.destroy();
    this.typeChart = undefined;
  }

  ngOnInit(): void {
    const savedUser = localStorage.getItem('finance-user');
    this.user = savedUser ? JSON.parse(savedUser) : null;
    this.userID = this.user?.user_id ?? null;

    if (this.userID) {
      void this.orderTransactions('new');
    } else {
      this.loadError = 'Could not find a user ID. Please sign in again.';
    }
  }

  async filterTransactions(buttonId: string): Promise<void> {
    this.activeFilter = buttonId;
    await this.loadTransactions();
  }

  async orderTransactions(order: TransactionOrder): Promise<void> {
    this.transaction_type = order;
    await this.loadTransactions();
  }

  async searchTransactions(): Promise<void> {
    await this.loadTransactions();
  }

  get transactionTypeTotals(): { type: string; amount: number; count: number }[] {
    const totals = new Map<string, { type: string; amount: number; count: number }>();
    for (const item of this.summaryTransactions) {
      const current = totals.get(item.transaction_type) ?? {
        type: item.transaction_type,
        amount: 0,
        count: 0,
      };
      current.amount += Number(item.amount) || 0;
      current.count += 1;
      totals.set(item.transaction_type, current);
    }
    return [...totals.values()].sort((first, second) => first.type.localeCompare(second.type));
  }

  get totalTransactionAmount(): number {
    return this.transactionTypeTotals.reduce((total, item) => total + item.amount, 0);
  }

  getTransactionTypeColor(index: number): string {
    return this.chartColors[index % this.chartColors.length];
  }

  updateTypeChart(): void {
    if (!this.typeChart) return;
    const totals = this.transactionTypeTotals;
    this.typeChart.data.labels = totals.map((item) => item.type);
    this.typeChart.data.datasets[0].data = totals.map((item) => item.amount);
    this.typeChart.data.datasets[0].backgroundColor = totals.map((_, index) => this.getTransactionTypeColor(index));
    this.typeChart.update('none');
  }

  private async loadTransactions(): Promise<void> {
    if (!this.userID) {
      this.loadError = 'Could not find a user ID. Please sign in again.';
      return;
    }

    const requestSequence = ++this.requestSequence;
    this.loadError = '';
    this.isLoading = true;
    const searchTerm = this.searchTerm.trim();
    const transactionType =
      this.activeFilter === 'incomebtn' ? 'Income' : this.activeFilter === 'expenseBtn' ? 'Expense' : null;

    if (searchTerm) {
      this.transactionAPI = `http://127.0.0.1:8000/transactionSearch/${this.userID}?search_term=${encodeURIComponent(searchTerm)}`;
    } else {
      this.transactionAPI = `http://127.0.0.1:8000/transactionFilter/${this.userID}/true/${ORDER_API_VALUES[this.transaction_type]}`;
    }

    try {
      const response = await fetch(this.transactionAPI);
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const transactions: Transaction[] = await response.json();
      if (requestSequence !== this.requestSequence) return;
      this.summaryTransactions = transactions;
      const filteredTransactions = transactionType
        ? transactions.filter((item) => item.transaction_type === transactionType)
        : transactions;
      this.transaction = this.sortTransactions(filteredTransactions);
      this.updateTypeChart();
    } catch (error) {
      if (requestSequence === this.requestSequence) {
        this.loadError = error instanceof Error ? error.message : 'Could not load transactions.';
        console.error('Failed to load transactions:', error);
      }
    } finally {
      if (requestSequence === this.requestSequence) {
        this.isLoading = false;
        this.changeDetector.detectChanges();
      }
    }
  }

  private sortTransactions(transactions: Transaction[]): Transaction[] {
    const sortedTransactions = [...transactions];

    switch (this.transaction_type) {
      case 'new':
        return sortedTransactions.sort(
          (first, second) => new Date(second.transaction_date).getTime() - new Date(first.transaction_date).getTime(),
        );
      case 'old':
        return sortedTransactions.sort(
          (first, second) => new Date(first.transaction_date).getTime() - new Date(second.transaction_date).getTime(),
        );
      case 'A-Z':
        return sortedTransactions.sort((first, second) => first.description.localeCompare(second.description));
      case 'Z-A':
        return sortedTransactions.sort((first, second) => second.description.localeCompare(first.description));
      case 'highest':
        return sortedTransactions.sort((first, second) => Number(second.amount) - Number(first.amount));
      case 'lowest':
        return sortedTransactions.sort((first, second) => Number(first.amount) - Number(second.amount));
    }
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
  }
}
