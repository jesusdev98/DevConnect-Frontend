import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app-module';

registerLocaleData(localeEs);

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
