import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { renderBootError } from './boot-error';

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  console.error(error);
  void renderBootError();
});
