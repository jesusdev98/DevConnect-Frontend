import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { APP_INITIALIZER, LOCALE_ID, NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { ForgotPassword } from './forgot-password/forgot-password';
import { LoginComponent } from './login/login';
import { Register } from './register/register';
import { ResetPassword } from './reset-password/reset-password';
import { Profile } from './profile/profile';
import { Home } from './home/home/home';
import { CreatePost } from './home/create-post/create-post';
import { HomeHeader } from './home/home-header/home-header';
import { HomeSidebar } from './home/home-sidebar/home-sidebar';
import { CreatePostCard } from './home/create-post-card/create-post-card';
import { PostList } from './home/post-list/post-list';
import { HomeFeed } from './home/home-feed/home-feed';
import { HomeSuggestions } from './home/home-suggestions/home-suggestions';
import { HomeRightAside } from './home/home-right-aside/home-right-aside';
import { PostDetail } from './post-detail/post-detail';
import { ProfileAccountTab } from './profile/profile-account-tab/profile-account-tab';
import { ProfileAchievementsTab } from './profile/profile-achievements-tab/profile-achievements-tab';
import { ProfileAdminTab } from './profile/profile-admin-tab/profile-admin-tab';
import { ProfileHero } from './profile/profile-hero/profile-hero';
import { ProfilePostsTab } from './profile/profile-posts-tab/profile-posts-tab';
import { UserLevelComponent } from './profile/user-level/user-level';
import { CredentialsInterceptor } from './interceptors/credentials.interceptor';
import { IconDelete } from './shared/icons/icon-delete/icon-delete';
import { IconEdit } from './shared/icons/icon-edit/icon-edit';
import { IconBookmark } from './shared/icons/icon-bookmark/icon-bookmark';
import { UiToast } from './shared/ui-toast/ui-toast';
import { ConfirmModal } from './shared/confirm-modal/confirm-modal';
import { AuthService } from './services/auth.service';
import { firstValueFrom } from 'rxjs';

registerLocaleData(localeEs);

const hydrateAuthSession = (authService: AuthService): (() => Promise<unknown>) => {
  return () => firstValueFrom(authService.hydrateSession());
};

/**
 * Main Angular module for the DevConnect SPA.
 *
 * Key responsibilities:
 * - declares the feature components rendered by the router.
 * - wires reactive forms and HttpClient for auth and content flows.
 * - registers the credentials interceptor required by Laravel Sanctum.
 */
@NgModule({
  declarations: [
    App,
    LoginComponent,
    Register,
    ForgotPassword,
    ResetPassword,
    Profile,
    Home,
    CreatePost,
    HomeHeader,
    HomeSidebar,
    CreatePostCard,
    PostList,
    HomeFeed,
    HomeSuggestions,
    HomeRightAside,
    PostDetail,
    ProfileAccountTab,
    ProfileAchievementsTab,
    ProfileAdminTab,
    ProfileHero,
    ProfilePostsTab,
    UserLevelComponent,
    IconDelete,
    IconEdit,
    IconBookmark,
    UiToast,
    ConfirmModal,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: LOCALE_ID, useValue: 'es-ES' },
    // Interceptor global para enviar cookies de sesion al backend Laravel.
    {
      provide: HTTP_INTERCEPTORS,
      useClass: CredentialsInterceptor,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: hydrateAuthSession,
      deps: [AuthService],
      multi: true,
    },
  ],
  bootstrap: [App]
})
export class AppModule { }
