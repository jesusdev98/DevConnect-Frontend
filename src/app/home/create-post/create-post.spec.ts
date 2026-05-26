import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Mock, vi } from 'vitest';
import { PostService } from '../../services/post-service';
import { TagCatalogService } from '../../services/tag-catalog.service';

import { CreatePost } from './create-post';

describe('CreatePost', () => {
  let component: CreatePost;
  let fixture: ComponentFixture<CreatePost>;
  let postService: {
    createPost: Mock;
    updatePost: Mock;
    getPostById: Mock;
  };

  beforeEach(async () => {
    postService = {
      createPost: vi.fn().mockReturnValue(of({})),
      updatePost: vi.fn().mockReturnValue(of({})),
      getPostById: vi.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      declarations: [CreatePost],
      providers: [
        provideRouter([]),
        {
          provide: PostService,
          useValue: postService,
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

  it('marks the form invalid when content exceeds the maximum length', () => {
    component.form.setValue({
      title: 'Titulo valido',
      content: 'a'.repeat(component.maxContentLength + 1),
    });

    expect(component.form.invalid).toBe(true);
    expect(component.form.get('content')?.errors?.['maxlength']).toBeTruthy();
  });

  it('accepts content at the maximum length boundary', () => {
    component.form.setValue({
      title: 'Titulo valido',
      content: 'a'.repeat(component.maxContentLength),
    });

    expect(component.form.valid).toBe(true);
  });

  it('does not call createPost when content exceeds the maximum length', () => {
    component.form.setValue({
      title: 'Titulo valido',
      content: 'a'.repeat(component.maxContentLength + 1),
    });

    component.onSubmit();

    expect(postService.createPost).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
