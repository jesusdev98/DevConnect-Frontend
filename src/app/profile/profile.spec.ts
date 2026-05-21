import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { PostService } from '../services/post-service';
import { FollowService } from '../services/follow.service';
import { LikeService } from '../services/like.service';
import { UiFeedbackService } from '../services/ui-feedback.service';
import { ProfileLinkService } from '../services/profile-link.service';

import { Profile } from './profile';

describe('Profile', () => {
  let component: Profile;
  let fixture: ComponentFixture<Profile>;
  let authServiceMock: { logout: ReturnType<typeof vi.fn>; getCurrentUser: ReturnType<typeof vi.fn>; me: ReturnType<typeof vi.fn>; changePassword: ReturnType<typeof vi.fn> };
  let routerSpy: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authServiceMock = {
      logout: vi.fn(),
      getCurrentUser: vi.fn().mockReturnValue(null),
      me: vi.fn().mockReturnValue(of(null)),
      changePassword: vi.fn(),
    };
    routerSpy = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [Profile],
      providers: [
        FormBuilder,
        { provide: AuthService, useValue: authServiceMock },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({ get: () => null }),
            snapshot: { paramMap: { get: () => null }, queryParamMap: { get: () => null } },
            queryParamMap: of({ get: () => null }),
          },
        },
        {
          provide: UserService,
          useValue: {
            getPublicProfileByUsername: vi.fn().mockReturnValue(of(null)),
            updateMyBio: vi.fn().mockReturnValue(of({ bio: '' })),
          },
        },
        {
          provide: PostService,
          useValue: {
            getPostsByUser: vi.fn().mockReturnValue(of([])),
          },
        },
        {
          provide: FollowService,
          useValue: {
            toggleWithResult: vi.fn().mockReturnValue(of({ followedByCurrentUser: false, followersCount: 0 })),
          },
        },
        {
          provide: LikeService,
          useValue: {
            togglePostLike: vi.fn(),
            getPostLikeCount: vi.fn().mockReturnValue(0),
            hasLikedPost: vi.fn().mockReturnValue(false),
            hydratePosts: vi.fn(),
          },
        },
        {
          provide: UiFeedbackService,
          useValue: {
            info: vi.fn(),
            error: vi.fn(),
          },
        },
        {
          provide: ProfileLinkService,
          useValue: {
            getDefaultLinks: vi.fn().mockReturnValue([]),
            fromData: vi.fn().mockReturnValue([]),
            toData: vi.fn(),
            updateLink: vi.fn(),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(Profile);
    component = fixture.componentInstance;
    // CDR is resolved from the component's node injector, not the root injector.
    // Spy on the real instance to make detectChanges a no-op during tests.
    const cdr = fixture.debugElement.injector.get(ChangeDetectorRef);
    vi.spyOn(cdr, 'detectChanges').mockImplementation(() => {});
    vi.spyOn(cdr, 'markForCheck').mockImplementation(() => {});
    authServiceMock.logout.mockReturnValue(of({}));
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra el boton de cerrar sesion', () => {
    const button = fixture.debugElement.query(By.css('[data-cy="profile-logout"]'));
    expect(button).toBeTruthy();
    expect(button.nativeElement.textContent?.trim()).toBe('Cerrar sesión');
  });

  it('llama al servicio de logout al pulsar cerrar sesion', () => {
    const button = fixture.debugElement.query(By.css('[data-cy="profile-logout"]'));
    button.nativeElement.click();

    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
  });

  it('redirige a /login despues de cerrar sesion', () => {
    const button = fixture.debugElement.query(By.css('[data-cy="profile-logout"]'));
    button.nativeElement.click();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });
});
