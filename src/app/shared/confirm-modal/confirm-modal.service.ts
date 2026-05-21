import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface ConfirmModalState {
  isOpen: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmModalService {
  private readonly stateSubject = new BehaviorSubject<ConfirmModalState>({
    isOpen: false,
    message: '',
  });
  private resolver: ((result: boolean) => void) | null = null;

  readonly state$ = this.stateSubject.asObservable();

  confirm(message: string): Promise<boolean> {
    if (this.resolver) {
      this.resolver(false);
      this.resolver = null;
    }

    this.stateSubject.next({
      isOpen: false,
      message: '',
    });

    this.stateSubject.next({
      isOpen: true,
      message,
    });

    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  resolve(result: boolean): void {
    if (this.resolver) {
      this.resolver(result);
      this.resolver = null;
    }

    this.stateSubject.next({
      isOpen: false,
      message: '',
    });
  }
}
