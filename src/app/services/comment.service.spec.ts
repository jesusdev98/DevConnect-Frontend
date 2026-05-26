import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { CommentService } from './comment.service';

describe('CommentService', () => {
  let service: CommentService;
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

    service = TestBed.inject(CommentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('normalizes root comments with pinned state and nested replies', () => {
    let result: any;

    service.loadCommentTree(91).subscribe((comments) => {
      result = comments;
    });

    const request = httpMock.expectOne(`${environment.apiUrl}/api/posts/91/comments`);

    expect(request.request.method).toBe('GET');

    request.flush({
      data: [
        {
          id: 1,
          postId: 91,
          userId: 7,
          username: 'ada',
          text: 'Comentario fijado',
          createdAt: '2026-05-26T10:00:00.000Z',
          likesCount: 2,
          likedByCurrentUser: true,
          isPinned: true,
          parentId: null,
          replies: [
            {
              id: 2,
              postId: 91,
              userId: 8,
              username: 'grace',
              text: 'Respuesta',
              createdAt: '2026-05-26T10:10:00.000Z',
              likesCount: 0,
              likedByCurrentUser: false,
              isPinned: false,
              parentId: 1,
            },
          ],
        },
      ],
    });

    expect(result.length).toBe(1);
    expect(result[0].isPinned).toBeTruthy();
    expect(result[0].replies?.length).toBe(1);
    expect(result[0].replies?.[0].isPinned).toBeFalsy();
  });

  it('calls the admin pin toggle endpoint for comments', () => {
    let result: any;

    service.toggleAdminPin(14).subscribe((payload) => {
      result = payload;
    });

    const request = httpMock.expectOne(`${environment.apiUrl}/api/admin/comments/14/pin-toggle`);

    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBeTruthy();

    request.flush({
      data: {
        id: 14,
        postId: 55,
        isPinned: true,
      },
    });

    expect(result).toEqual({
      id: 14,
      postId: 55,
      isPinned: true,
    });
  });
});
