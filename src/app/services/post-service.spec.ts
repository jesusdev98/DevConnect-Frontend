import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { PostService } from './post-service';

describe('PostService', () => {
  let service: PostService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: {
            csrf: () => of(null),
            me: () => of(null),
            runWhenAuthenticated: (factory: () => unknown) => factory(),
          },
        },
      ],
    });

    service = TestBed.inject(PostService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('normalizes a paginated posts response', () => {
    let result: any;

    service.getPostsPage({
      tagIds: [4, 9],
      match: 'all',
      followOnly: true,
      query: 'angular',
    }, 2).subscribe((page) => {
      result = page;
    });

    const request = httpMock.expectOne((req) =>
      req.url === `${environment.apiUrl}/api/posts`
        && req.params.get('page') === '2'
        && req.params.get('match') === 'all'
        && req.params.get('q') === 'angular'
        && req.params.get('feed') === 'following'
        && req.params.getAll('tag_ids[]')?.join(',') === '4,9',
    );

    expect(request.request.method).toBe('GET');

    request.flush({
      success: true,
      message: 'OK',
      data: [
        {
          id: 7,
          title: 'Post paginado',
          content: 'Contenido de prueba',
          tags: ['Angular', 'Backend'],
          tagItems: [
            { id: 1, name: 'Angular' },
            { id: 2, name: 'Backend' },
          ],
          createdAt: '2026-04-10T10:00:00.000Z',
          author: {
            id: 3,
            name: 'Ada',
            username: 'ada',
            avatar: null,
          },
          commentsCount: 4,
          likesCount: 9,
          isPinned: true,
          likedByCurrentUser: true,
          is_saved: false,
        },
      ],
      meta: {
        currentPage: 2,
        perPage: 20,
        hasMore: false,
        nextPage: null,
      },
    });

    expect(result.currentPage).toBe(2);
    expect(result.hasMore).toBeFalsy();
    expect(result.nextPage).toBeNull();
    expect(result.posts.length).toBe(1);
    expect(result.posts[0].id).toBe(7);
    expect(result.posts[0].tagIds).toEqual([1, 2]);
    expect(result.posts[0].isPinned).toBeTruthy();
  });

  it('loads all user posts across paginated pages', () => {
    let result: any;

    service.getPostsByUser(12).subscribe((posts) => {
      result = posts;
    });

    const firstRequest = httpMock.expectOne((req) =>
      req.url === `${environment.apiUrl}/api/users/12/posts`
        && req.params.get('page') === '1',
    );

    firstRequest.flush({
      success: true,
      message: 'OK',
      data: [
        {
          id: 1,
          title: 'Primero',
          content: 'Contenido de prueba',
          tags: [],
          tagItems: [],
          createdAt: '2026-04-10T10:00:00.000Z',
          author: null,
          commentsCount: 0,
          likesCount: 0,
          isPinned: false,
          likedByCurrentUser: false,
          is_saved: false,
        },
      ],
      meta: {
        currentPage: 1,
        perPage: 20,
        hasMore: true,
        nextPage: 2,
      },
    });

    const secondRequest = httpMock.expectOne((req) =>
      req.url === `${environment.apiUrl}/api/users/12/posts`
        && req.params.get('page') === '2',
    );

    secondRequest.flush({
      success: true,
      message: 'OK',
      data: [
        {
          id: 2,
          title: 'Segundo',
          content: 'Contenido de prueba',
          tags: [],
          tagItems: [],
          createdAt: '2026-04-10T09:00:00.000Z',
          author: null,
          commentsCount: 0,
          likesCount: 0,
          isPinned: false,
          likedByCurrentUser: false,
          is_saved: false,
        },
      ],
      meta: {
        currentPage: 2,
        perPage: 20,
        hasMore: false,
        nextPage: null,
      },
    });

    expect(result.length).toBe(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });

  it('calls the admin pin toggle endpoint for posts', () => {
    let result: any;

    service.toggleAdminPin(33).subscribe((payload) => {
      result = payload;
    });

    const request = httpMock.expectOne(`${environment.apiUrl}/api/admin/posts/33/pin-toggle`);

    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBeTruthy();

    request.flush({
      success: true,
      message: 'OK',
      data: {
        id: 33,
        isPinned: true,
      },
    });

    expect(result).toEqual({
      id: 33,
      isPinned: true,
    });
  });
});
