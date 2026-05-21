import { Injectable } from '@angular/core';
import { Observable, Subject, debounceTime } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LevelRefreshService {
  private readonly refreshSubject = new Subject<void>();

  readonly refresh$: Observable<void> = this.refreshSubject.pipe(
    debounceTime(300),
  );

  trigger(): void {
    this.refreshSubject.next();
  }
}
