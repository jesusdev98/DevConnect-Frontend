import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('renders locked and unlocked achievements', async () => {
    userServiceMock.getUserAchievements.mockReturnValue(of([unlockedAchievement, lockedAchievement]));

    await setUserId(1);

    const cards = fixture.debugElement.queryAll(By.css('.logro-card'));
    expect(cards).toHaveLength(2);
    expect(cards[0].nativeElement.textContent).toContain('Desbloqueado el');
    expect(cards[1].nativeElement.textContent).toContain('Bloqueado');
    expect(cards[1].nativeElement.classList).toContain('logro-card--locked');
  });

  it('shows an empty state when the user has no achievements', async () => {
    userServiceMock.getUserAchievements.mockReturnValue(of([]));

    await setUserId(1);

    const status = fixture.debugElement.query(By.css('.logros-status'));
    expect(status.nativeElement.textContent).toContain('Todavía no hay logros desbloqueados');
    expect(fixture.debugElement.queryAll(By.css('.logro-card'))).toHaveLength(0);
  });

  it('ignores stale achievement responses when switching profiles', async () => {
    const firstUserResponse = new Subject<UserAchievement[]>();
    const secondUserResponse = new Subject<UserAchievement[]>();
    userServiceMock.getUserAchievements
      .mockReturnValueOnce(firstUserResponse.asObservable())
      .mockReturnValueOnce(secondUserResponse.asObservable());

    await setUserId(1);
    await setUserId(2);

    secondUserResponse.next([lockedAchievement]);
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('.logro-card'))).toHaveLength(1);
    expect(fixture.debugElement.query(By.css('.logro-card'))?.nativeElement.textContent).toContain('Veterano');

    firstUserResponse.next([unlockedAchievement]);
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('.logro-card'))).toHaveLength(1);
    expect(fixture.debugElement.query(By.css('.logro-card'))?.nativeElement.textContent).toContain('Veterano');
  });

  async function setUserId(userId: number | null): Promise<void> {
    component.userId = userId;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
});
