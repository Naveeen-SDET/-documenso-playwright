import { test as base } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';
import { DocumentPage } from '../pages/DocumentPage';
import { LoginPage } from '../pages/LoginPage';
import { DocumentsApi } from '../api/documents.api';
import { env } from '../config/env';

type Fixtures = {
  dashboardPage: DashboardPage;
  documentPage:  DocumentPage;
  loginPage:     LoginPage;
  docsApi:       DocumentsApi;
};

export const test = base.extend<Fixtures>({

  dashboardPage: async ({ page }, use) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto('/documents');
    await use(dashboard);
  },

  documentPage: async ({ page }, use) => {
    await use(new DocumentPage(page));
  },

  loginPage: async ({ page }, use) => {
    const login = new LoginPage(page);
    await login.goto('/signin');
    await use(login);
  },

  docsApi: async ({ request }, use) => {
    await use(new DocumentsApi(request, env.baseUrl, env.apiKey));
  },

});

export { expect } from '@playwright/test';