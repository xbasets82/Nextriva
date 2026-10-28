import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, role: 'MANAGER' | 'COLLABORATOR') {
  await page.goto('/#/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(process.env[`DEMO_${role}_EMAIL`]!);
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill(process.env[`DEMO_${role}_PASSWORD`]!);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cerrar sesión', exact: true }),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  expect(
    cookies.some(
      (cookie) =>
        cookie.name === '__Host-nextriva_session' &&
        cookie.secure &&
        cookie.httpOnly &&
        cookie.sameSite === 'Lax',
    ),
  ).toBe(true);
}

test('production HTTPS preserves API routes and independent solution approval with real PostgreSQL', async ({
  browser,
  page,
  baseURL,
}) => {
  const root = await page.goto('/');
  expect(root?.status()).toBe(200);
  expect(root?.headers()['content-type']).toContain('text/html');
  const client = await page.goto('/client-side-route');
  expect(client?.headers()['content-type']).toContain('text/html');
  for (const path of ['/api', '/api/not-a-real-route']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    expect(response?.headers()['content-type']).toContain('application/json');
  }
  await page.goto('/');
  const health = await page.evaluate(async () =>
    (await fetch('/api/health')).json(),
  );
  expect(health).toEqual({ status: 'ok' });

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await page.route('**/api/auth/login', (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          'x-forwarded-for': `198.51.100.${attempt}`,
        },
      }),
    );
    const status = await page.evaluate(
      async () =>
        (
          await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'rate-limit-spoof@demo.nextriva.invalid',
              password: 'invalid synthetic password',
            }),
          })
        ).status,
    );
    await page.unroute('**/api/auth/login');
    expect(status).toBe(attempt < 6 ? 401 : 429);
  }

  await login(page, 'COLLABORATOR');
  await page.goto('/#/incidents');
  await page
    .getByRole('button', { name: 'Crear incidencia', exact: true })
    .click();
  await page
    .getByLabel('Promoción', { exact: true })
    .selectOption({ label: 'DEMO — Jardines del Horizonte' });
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page
    .getByLabel('Título', { exact: true })
    .fill('I10.2 flujo HTTPS ficticio');
  await page
    .getByLabel('Descripción', { exact: true })
    .fill(
      'Incidencia completamente ficticia del artefacto de producción local.',
    );
  await page
    .getByLabel('Fase de origen', { exact: true })
    .selectOption('CONSTRUCTION');
  await page.getByLabel('Categoría', { exact: true }).selectOption('FINISHES');
  await page.getByLabel('Prioridad', { exact: true }).selectOption('MEDIUM');
  await page
    .getByRole('button', { name: 'Crear incidencia', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'I10.2 flujo HTTPS ficticio',
      exact: true,
    }),
  ).toBeVisible();
  const detail = page.url();
  await page
    .getByLabel('Comentario', { exact: true })
    .fill('Comentario ficticio a través del origen HTTPS.');
  await page
    .getByRole('button', { name: 'Publicar comentario', exact: true })
    .click();
  await expect(
    page.getByText('Comentario ficticio a través del origen HTTPS.', {
      exact: true,
    }),
  ).toBeVisible();
  const missingCsrf = await page.evaluate(
    async () => (await fetch('/api/auth/logout', { method: 'POST' })).status,
  );
  expect(missingCsrf).toBe(403);

  const reviewerContext = await browser.newContext({ baseURL });
  try {
    const reviewer = await reviewerContext.newPage();
    await login(reviewer, 'MANAGER');
    await reviewer.goto(detail);
    await reviewer
      .getByLabel('Selecciona un nuevo responsable', { exact: true })
      .selectOption({ label: 'Demo Colaboración' });
    await reviewer
      .getByRole('button', { name: 'Asignar responsable', exact: true })
      .click();
    await expect(
      reviewer.getByText('Demo Colaboración', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole('button', { name: 'Iniciar resolución', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'Solución', exact: true })
      .fill('Acabado ficticio corregido y comprobado de forma independiente.');
    await page
      .getByRole('button', { name: 'Enviar a validación', exact: true })
      .click();
    await expect(
      page.getByText('Pendiente de validación', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Aprobar solución', exact: true }),
    ).toHaveCount(0);
    await reviewer.reload();
    await reviewer
      .getByRole('button', { name: 'Aprobar solución', exact: true })
      .click();
    await reviewer
      .getByRole('button', { name: 'Confirmar aprobación', exact: true })
      .click();
    await expect(reviewer.getByText('Cerrada', { exact: true })).toBeVisible();
    await reviewer.reload();
    await expect(reviewer.getByText('Cerrada', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
  } finally {
    await reviewerContext.close();
  }
});
