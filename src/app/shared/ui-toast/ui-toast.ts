import { Component, inject } from '@angular/core';
import { UiFeedbackService } from '../../services/ui-feedback.service';

@Component({
  selector: 'app-ui-toast',
  standalone: false,
  templateUrl: './ui-toast.html',
  styleUrl: './ui-toast.scss',
})
export class UiToast {
  readonly feedback = inject(UiFeedbackService);
}
