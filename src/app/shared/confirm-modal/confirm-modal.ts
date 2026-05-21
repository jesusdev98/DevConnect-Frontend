import { Component, EventEmitter, HostListener, Input, OnDestroy, Output, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ConfirmModalService } from './confirm-modal.service';

@Component({
  selector: 'app-confirm-modal',
  standalone: false,
  templateUrl: './confirm-modal.html',
  styleUrl: './confirm-modal.scss',
})
export class ConfirmModal implements OnDestroy {
  private readonly confirmModalService = inject(ConfirmModalService);
  private readonly destroy$ = new Subject<void>();

  @Input() message: string = '';
  @Output() readonly confirmed = new EventEmitter<boolean>();
  @Output() readonly cancelled = new EventEmitter<boolean>();

  readonly state$ = this.confirmModalService.state$;

  constructor() {
    this.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  onConfirm(): void {
    this.confirmed.emit(true);
    this.confirmModalService.resolve(true);
  }

  onCancel(): void {
    this.cancelled.emit(false);
    this.confirmModalService.resolve(false);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.confirmModalService.resolve(false);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
