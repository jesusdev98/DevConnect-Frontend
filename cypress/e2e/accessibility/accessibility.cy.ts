import type { ImpactValue, Result, RunOptions } from 'axe-core';

type CypressAxeRunOptions = RunOptions & {
  includedImpacts?: ImpactValue[];
};

// ── Credenciales del usuario de prueba ──────────────────────────────────────
// Se generan una sola vez al cargar el módulo para que el before/session
// usen siempre los mismos valores dentro de esta ejecución.
const SUFFIX = Date.now().toString().slice(-8);
const TEST_EMAIL = `a11y_${SUFFIX}@devconnect.test`;
const TEST_PASSWORD = 'Password123!';
const TEST_USERNAME = `a11y_${SUFFIX}`;

// ── Configuración de axe ────────────────────────────────────────────────────
// Solo WCAG 2.1 Nivel A y AA. Solo impactos critical/serious para evitar
// ruido en primera ejecución. Ampliar a 'moderate' cuando el equipo esté listo.
const AXE_WCAG_AA: CypressAxeRunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  includedImpacts: ['critical', 'serious'],
};

// Callback que imprime cada violación de forma legible en el log de Cypress.
const printViolations = (violations: Result[]): void => {
  violations.forEach((v) => {
    cy.task('log', `[a11y][${v.impact?.toUpperCase()}] ${v.id} — ${v.description}`);
    v.nodes.forEach((n) => {
      cy.task('log', `  ↳ ${n.target.join(' > ')}: ${n.failureSummary ?? ''}`);
    });
  });
};

// ── Páginas públicas ─────────────────────────────────────────────────────────

describe('Accesibilidad — Páginas públicas', () => {
  it('login: sin violaciones WCAG 2.1 AA (critical/serious)', () => {
    cy.visit('/login');
    cy.injectAxe();
    cy.checkA11y(undefined, AXE_WCAG_AA, printViolations);
  });

  it('register: sin violaciones WCAG 2.1 AA (critical/serious)', () => {
    cy.visit('/register');
    cy.injectAxe();
    cy.checkA11y(undefined, AXE_WCAG_AA, printViolations);
  });
});

// ── Páginas autenticadas ─────────────────────────────────────────────────────
// cy.session() cachea las cookies del login UI para no relanzar el flujo
// completo en cada it(). Si el servidor se reinicia y la sesión expira,
// Cypress la recrea automáticamente con el mismo setup.

describe('Accesibilidad — Páginas autenticadas', () => {
  beforeEach(() => {
    cy.session('a11y-auth', () => {
      // registerByAPI es idempotente: un 422 por conflicto no interrumpe el test.
      cy.registerByAPI({
        nombre: 'A11y',
        apellidos: 'Tester',
        usuario: TEST_USERNAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        passwordConfirmation: TEST_PASSWORD,
      });
      // Login real por UI para que Sanctum establezca cookies en el navegador.
      cy.routeLaravelBrowserTraffic();
      cy.visit('/login');
      cy.loginByUI({ identifier: TEST_EMAIL, password: TEST_PASSWORD });
      cy.url().should('not.include', '/login');
    });
  });

  it('home: sin violaciones WCAG 2.1 AA (critical/serious)', () => {
    cy.routeLaravelBrowserTraffic();
    cy.visit('/home');
    cy.url().should('include', '/home');
    cy.injectAxe();
    cy.checkA11y(undefined, AXE_WCAG_AA, printViolations);
  });

  it('profile: sin violaciones WCAG 2.1 AA (critical/serious)', () => {
    cy.routeLaravelBrowserTraffic();
    cy.visit('/profile');
    cy.url().should('include', '/profile');
    cy.injectAxe();
    cy.checkA11y(undefined, AXE_WCAG_AA, printViolations);
  });
});
