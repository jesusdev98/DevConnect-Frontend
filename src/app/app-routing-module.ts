import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { Home } from './home/home/home';
import { CreatePost } from './home/create-post/create-post';
import { HomeFeed } from './home/home-feed/home-feed';
import { HomeSuggestions } from './home/home-suggestions/home-suggestions';
import { LoginComponent } from './login/login';
import { PostDetail } from './post-detail/post-detail';
import { Profile } from './profile/profile';
import { Register } from './register/register';

/**
 * Central route table for public auth pages and protected private areas.
 *
 * Security note:
 * - authenticated-only routes delegate access control to AuthGuard, which
 *   restores the Laravel session through /api/auth/me when needed.
 */
const routes: Routes = [
  // Redireccion inicial.
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Rutas publicas.
  { path: 'login', component: LoginComponent },
  { path: 'register', component: Register },
  { path: 'suggestions', redirectTo: 'home/suggestions', pathMatch: 'full' },

  // Ejemplo de ruta protegida con guard.
  { path: 'profile', component: Profile, canActivate: [AuthGuard] },
  { path: 'profile/:username', component: Profile, canActivate: [AuthGuard] },
  { path: 'posts/:id', component: PostDetail, canActivate: [AuthGuard] },

  // Area privada principal.
  {
    path: 'home',
    component: Home,
    // Si no hay sesion valida, el guard redirige a /login.
    canActivate: [AuthGuard],
    // Rutas hijas renderizadas dentro del router-outlet de Home.
    children: [
      // Vista por defecto en /home.
      { path: '', component: HomeFeed, pathMatch: 'full' },
      // Vista de creacion en /home/create-post.
      { path: 'create-post', component: CreatePost },
      // Vista de sugerencias en /home/suggestions.
      { path: 'suggestions', component: HomeSuggestions },
      // Vista de edicion reutilizando el mismo formulario de CreatePost.
      { path: 'edit-post/:id', component: CreatePost },
      // Vista de detalle en /home/post/:id (reemplaza solo el main del layout Home).
      { path: 'post/:id', component: PostDetail },
    ],
  },

  // Fallback global.
  { path: '**', redirectTo: 'login' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
/**
 * Encapsulates Angular router registration for the SPA.
 */
export class AppRoutingModule {}
