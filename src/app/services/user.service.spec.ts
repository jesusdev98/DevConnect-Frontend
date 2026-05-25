import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        UserService,
        {
          provide: AuthService,
          useValue: {
            runWhenAuthenticated: (factory: () => unknown) => factory(),
            csrf: () => null,
            me: () => null,
          },
        },
      ],
    });

    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('obtiene un perfil publico con headline y skills', () => {
    service.getPublicProfileByUsername('ana').subscribe((profile) => {
      expect(profile.id).toBe(7);
      expect(profile.headline).toBe('Estudiante de desarrollo web');
      expect(profile.skills).toEqual(['Angular', 'Laravel']);
      expect(profile.links.github).toBe('https://github.com/ana');
    });

    const request = httpMock.expectOne(`${environment.apiUrl}/api/users/username/ana`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);

    request.flush({
      success: true,
      data: {
        id: 7,
        name: 'Ana Perez',
        username: 'ana',
        headline: 'Estudiante de desarrollo web',
        bio: 'Bio de prueba',
        skills: ['Angular', 'Laravel'],
        links: {
          github: 'https://github.com/ana',
          linkedin: null,
          web: null,
        },
        avatar: null,
        postsCount: 3,
        commentsCount: 1,
        followersCount: 5,
        followedByCurrentUser: false,
      },
    });
  });

  it('actualiza el perfil profesional con un solo endpoint', () => {
    const payload = {
      headline: 'Desarrollador frontend',
      skills: ['Angular', 'TypeScript'],
      links: {
        github: 'https://github.com/ana',
        linkedin: 'https://linkedin.com/in/ana',
        web: null,
      },
    };

    service.updateMyProfile(payload).subscribe((response) => {
      expect(response.id).toBe(12);
      expect(response.headline).toBe('Desarrollador frontend');
      expect(response.skills).toEqual(['Angular', 'TypeScript']);
      expect(response.links.github).toBe('https://github.com/ana');
    });

    const request = httpMock.expectOne(`${environment.apiUrl}/api/auth/me/profile`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual(payload);

    request.flush({
      success: true,
      data: {
        id: 12,
        headline: 'Desarrollador frontend',
        skills: ['Angular', 'TypeScript'],
        links: {
          github: 'https://github.com/ana',
          linkedin: 'https://linkedin.com/in/ana',
          web: null,
        },
      },
    });
  });
});
