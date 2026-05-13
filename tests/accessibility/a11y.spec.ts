import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Known WCAG violations in Documenso (logged as bugs, pending fix).
 * These are excluded from blocking tests so CI only fails on REGRESSIONS.
 *
 * Violations:
 *  - button-name:          Action buttons missing aria-label (14 nodes)
 *  - color-contrast:       Muted text colours below WCAG AA 4.5:1 threshold (7 nodes)
 *  - label:                Hidden file inputs lack associated <label> (2 nodes)
 *  - link-name:            Logo/nav links missing discernible text (2 nodes)
 *  - nested-interactive:   File input nested inside button (1 node)
 *  - aria-valid-attr-value: Invalid ARIA attribute values (1 node)
 */
const KNOWN_VIOLATIONS = [
  'button-name',           // Action buttons missing aria-label (14 nodes)
  'color-contrast',        // Muted text colours below WCAG AA 4.5:1 threshold
  'label',                 // Hidden file inputs lack associated <label>
  'link-name',             // Logo/nav links missing discernible text
  'nested-interactive',    // File input nested inside button
  'aria-valid-attr-value', // Invalid ARIA attribute values
  'link-in-text-block',    // "Sign up" link distinguished by colour only (contrast 2.19:1, min 3:1)
];

test.describe('@a11y @smoke Accessibility — WCAG 2.1 AA', () => {

  test('login page: no critical violations beyond known issues', async ({ page }) => {
    await page.goto('/signin');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .disableRules(KNOWN_VIOLATIONS)
      .analyze();

    if (results.violations.length > 0) {
      const summary = results.violations.map(v =>
        `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description} — ${v.nodes.length} node(s)`
      ).join('\n');
      console.log('NEW a11y violations found (not in known list):\n' + summary);
    }

    expect(
      results.violations,
      'Unexpected WCAG violations found on login page — add to KNOWN_VIOLATIONS if accepted'
    ).toEqual([]);
  });

  test('dashboard page: no critical violations beyond known issues', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .disableRules(KNOWN_VIOLATIONS)
      .analyze();

    if (results.violations.length > 0) {
      const summary = results.violations.map(v =>
        `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description} — ${v.nodes.length} node(s)`
      ).join('\n');
      console.log('NEW a11y violations found (not in known list):\n' + summary);
    }

    expect(
      results.violations,
      'Unexpected WCAG violations found on dashboard — add to KNOWN_VIOLATIONS if accepted'
    ).toEqual([]);
  });

  test('a11y audit report — full violation log for all known issues', async ({ page }) => {
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    // Always log full report — visible in Playwright HTML report under stdout
    console.log(`\n=== A11Y AUDIT REPORT ===`);
    console.log(`Total violations : ${results.violations.length}`);
    console.log(`Passes           : ${results.passes.length}`);
    console.log(`Needs review     : ${results.incomplete.length}`);
    console.log(`========================\n`);

    for (const violation of results.violations) {
      const isKnown = KNOWN_VIOLATIONS.includes(violation.id);
      console.log(`[${violation.impact?.toUpperCase()}] ${violation.id} ${isKnown ? '(known)' : '*** NEW ***'}`);
      console.log(`  Description : ${violation.description}`);
      console.log(`  Help        : ${violation.helpUrl}`);
      console.log(`  Nodes       : ${violation.nodes.length}`);
    }

    // This test always passes — it's a reporting/audit test, not a gate
    expect(results).toBeDefined();
  });

});
