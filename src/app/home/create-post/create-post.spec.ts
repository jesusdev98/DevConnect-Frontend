import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PostService } from '../../services/post-service';
import { TagCatalogService } from '../../services/tag-catalog.service';

import { CreatePost } from './create-post';

describe('CreatePost', () => {
  let component: CreatePost;
  let fixture: ComponentFixture<CreatePost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      declarations: [CreatePost],
      providers: [
        provideRouter([]),
        {
          provide: PostService,
          useValue: {
            createPost: () => of({}),
          },
        },
        {
          provide: TagCatalogService,
          useValue: {
            getTagCategories: () => of([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreatePost);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
