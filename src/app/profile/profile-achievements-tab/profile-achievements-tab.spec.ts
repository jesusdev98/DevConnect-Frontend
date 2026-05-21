import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { By } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { UserAchievement, UserService } from '../../services/user.service';
import { ProfileAchievementsTab } from './profile-achievements-tab';

describe('ProfileAchievementsTab', () => {
  let fixture: ComponentFixture<ProfileAchievementsTab>;
  let component: ProfileAchievementsTab;
  let userServiceMock: { getUserAchievements: ReturnType<typeof vi.fn> };

  const unlockedAchievement: UserAchievement = {
    key: 'first_follower',
    title: 'Primera conexion',
    description: 'Alguien te ha seguido por primera vez.',
    icon: '*',
    unlocked: true,
    unlockedAt: '2026-05-19 14:53:46',
  };

  const lockedAchievement: UserAchievement = {
    key: 'level_5',
    title: 'Veterano',
    description: 'Has alcanzado el nivel 5.',
    icon: '*',
    unlocked: false,
    unlockedAt: null,
  };

  beforeEach(async () => {
    userServiceMock = {
      getUserAchievements: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [ProfileAchievementsTab],
      imports: [CommonModule],
      providers: [
        { provide: UserService, useValue: userServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileAchievementsTab);
    component = fixture.componentInstance;
  });

  it('renders locked and unlocked achievements', () => {
    userServiceMock.getUserAchievements.mockReturnValue(of([unlockedAchievement, lockedAchievement]));

    setUserId(1);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css('.logro-card'));
    expect(cards).toHaveLength(2);
    expect(cards[0].nativeElement.textContent).toContain('Desbloqueado el');
    expect(cards[1].nativeElement.textContent).toContain('Bloqueado');
    expect(cards[1].nativeElement.classList).toContain('logro-card--locked');
  });

  it('ignores stale achievement responses when switching profiles', () => {
    const firstUserResponse = new Subject<UserAchievement[]>();
    const secondUserResponse = new Subject<UserAchievement[]>();
    userServiceMock.getUserAchievements
      .mockReturnValueOnce(firstUserResponse.asObservable())
      .mockReturnValueOnce(secondUserResponse.asObservable());

    setUserId(1);
    setUserId(2);

    secondUserResponse.next([lockedAchievement]);
    fixture.detectChanges();
    expect(component.achievements).toEqual([lockedAchievement]);

    firstUserResponse.next([unlockedAchievement]);
    fixture.detectChanges();
    expect(component.achievements).toEqual([lockedAchievement]);
  });

  function setUserId(userId: number | null): void {
    const previousValue = component.userId;
    component.userId = userId;
    component.ngOnChanges({
      userId: new SimpleChange(previousValue, userId, previousValue === null),
    });
  }
});
