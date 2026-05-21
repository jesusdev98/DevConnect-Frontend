import { Component } from '@angular/core';

@Component({
  selector: 'app-create-post-card',
  standalone: false,
  templateUrl: './create-post-card.html',
  styleUrl: './create-post-card.scss',
})
//Componente de UI para mostrar una tarjeta de creación de post en el feed.

export class CreatePostCard {
  draftContent = '';
}

