import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type FeedbackType = 'success' | 'error' | 'info';

export interface FeedbackMessage {
  id: number;
  text: string;
  type: FeedbackType;
}

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  // Shared message queue consumed by the global toast component.
  private readonly messagesSubject = new BehaviorSubject<FeedbackMessage[]>([]);
  readonly messages$ = this.messagesSubject.asObservable();
  private nextId = 1;

  success(text: string, durationMs = 2600): void {
    this.show(text, 'success', durationMs);
  }

  error(text: string, durationMs = 3200): void {
    this.show(text, 'error', durationMs);
  }

  info(text: string, durationMs = 2200): void {
    this.show(text, 'info', durationMs);
  }

  dismiss(id: number): void {
    this.messagesSubject.next(this.messagesSubject.value.filter((m) => m.id !== id));
  }

  private show(text: string, type: FeedbackType, durationMs: number): void {
    const message: FeedbackMessage = { id: this.nextId++, text, type };
    this.messagesSubject.next([...this.messagesSubject.value, message]);
    // Auto-dismiss keeps feedback lightweight without manual cleanup on each action.
    setTimeout(() => this.dismiss(message.id), durationMs);
  }
}
