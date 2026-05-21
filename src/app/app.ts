import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
/**
 * Root component for the Angular SPA shell.
 *
 * Responsibility:
 * - hosts the global application layout and router outlet tree.
 * - exposes a lightweight reactive title signal for template-level metadata.
 */
export class App {
  protected readonly title = signal('frontend');
}
