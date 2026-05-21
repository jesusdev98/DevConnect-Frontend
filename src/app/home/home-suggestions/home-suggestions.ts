import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { environment } from '../../../environments/environment';

// Quick chip options for classifying the suggestion before opening the mail client.
const suggestionTypes = ['Idea', 'Bug', 'Mejora'] as const;
type SuggestionType = (typeof suggestionTypes)[number];

@Component({
  selector: 'app-home-suggestions',
  standalone: false,
  templateUrl: './home-suggestions.html',
  styleUrl: './home-suggestions.scss',
})
/**
 * Simple feedback form that opens the user's mail client with a prefilled
 * suggestion message for the DevConnect contact inbox.
 */
export class HomeSuggestions {
  private readonly fb = inject(FormBuilder);

  readonly contactEmail = environment.contactEmail;
  readonly suggestionTypes = suggestionTypes;
  // Tracks the active chip and whether we already showed the "sent" feedback.
  selectedType: SuggestionType = 'Idea';
  submitted = false;

  readonly form = this.fb.group({
    subject: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(120)]],
    message: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(1000)]],
  });

  constructor() {
    // Any change in the form clears the success message so it never feels stale.
    this.form.valueChanges.subscribe(() => {
      this.submitted = false;
    });
  }

  selectType(type: SuggestionType): void {
    this.selectedType = type;
    this.submitted = false;
  }

  sendSuggestion(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const subjectText = String(value.subject ?? '').trim();
    const message = String(value.message ?? '').trim();

    const subject = `[${this.selectedType}] ${subjectText}`;
    // Keep the email body short and readable inside the user's mail client.
    const bodyLines = [
      'Hola equipo de DevConnect,',
      '',
      `Tipo: ${this.selectedType}`,
      `Asunto: ${subjectText}`,
      '',
      'Mensaje:',
      message,
      '',
      'Gracias.',
    ];

    const mailtoUrl = this.buildMailtoUrl(
      subject,
      bodyLines.filter((line): line is string => line !== null).join('\n'),
    );
    this.submitted = true;
    window.location.href = mailtoUrl;
  }

  resetForm(): void {
    this.selectedType = 'Idea';
    this.submitted = false;
    this.form.reset({
      subject: '',
      message: '',
    });
  }

  private buildMailtoUrl(subject: string, body: string): string {
    // Encode subject/body explicitly so spaces and line breaks survive in mailto URLs.
    const encodedBody = encodeURIComponent(body).replace(/%0A/g, '%0D%0A');

    return `mailto:${this.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodedBody}`;
  }
}
