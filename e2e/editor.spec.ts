import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FPD_SOURCE = [
    '@startfpd',
    'title "E2E Test"',
    'product p1 "Raw"',
    'process_operator po1 "Cut"',
    'technical_resource tr1 "Laser"',
    'product p2 "Done"',
    'p1 --> po1',
    'po1 --> p2',
    'po1 <..> tr1',
    '@endfpd',
].join('\n');

/** Type text into the Monaco editor by replacing its full content. */
async function setEditorContent(page: import('@playwright/test').Page, text: string) {
    const editor = page.locator('.monaco-editor').first();
    await editor.click();

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+KeyA`);
    await page.keyboard.type(text, { delay: 0 });
}

/** Wait for the diagram SVG to contain at least one rendered element. */
async function waitForDiagram(page: import('@playwright/test').Page) {
    await page.locator('svg[aria-label="FPD process diagram"] [data-element-id]').first().waitFor({
        state: 'attached',
        timeout: 15_000,
    });
}

/** Wait for Monaco to be ready, with generous timeout. */
async function waitForEditor(page: import('@playwright/test').Page) {
    await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Tests — each gets a fresh page, serial execution to avoid port contention
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForEditor(page);
});

// ---- 1. Edit -> Diagram appears ----

test('typing FPD source renders diagram elements', async ({ page }) => {
    await setEditorContent(page, FPD_SOURCE);
    await waitForDiagram(page);

    const elements = page.locator('svg[aria-label="FPD process diagram"] [data-element-id]');
    const count = await elements.count();
    expect(count).toBeGreaterThanOrEqual(4);
});

test('diagram shows correct element types', async ({ page }) => {
    await setEditorContent(page, FPD_SOURCE);
    await waitForDiagram(page);

    const svg = page.locator('svg[aria-label="FPD process diagram"]');
    await expect(svg.locator('[data-element-type="processOperator"]')).toHaveCount(1);
    await expect(svg.locator('[data-element-type="technicalResource"]')).toHaveCount(1);
});

// ---- 2. Syntax error -> Error indicator ----

test('invalid FPD shows error status in toolbar', async ({ page }) => {
    await setEditorContent(page, '@startfpd\nfoobar baz\n@endfpd');

    // Either error status in toolbar or error panel should appear
    const errorIndicator = page.locator('.toolbar__status--error, .error-panel');
    await expect(errorIndicator.first()).toBeVisible({ timeout: 15_000 });
});

// ---- 3. Export menu ----

test('export menu opens and shows options', async ({ page }) => {
    await setEditorContent(page, FPD_SOURCE);
    await waitForDiagram(page);

    await page.locator('button[aria-label="Export diagram"]').click();
    const menu = page.locator('ul[role="menu"]');
    await expect(menu).toBeVisible();

    const items = menu.locator('li[role="menuitem"]');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(3);
});

test('export XML triggers download', async ({ page }) => {
    await setEditorContent(page, FPD_SOURCE);
    await waitForDiagram(page);

    await page.locator('button[aria-label="Export diagram"]').click();
    await page.locator('ul[role="menu"]').waitFor({ state: 'visible' });

    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }),
        page.locator('li[role="menuitem"] >> text=XML').click(),
    ]);

    expect(download.suggestedFilename()).toContain('.xml');
});

// ---- 4. Import file ----

test('importing an FPD file populates editor and diagram', async ({ page }) => {
    const fpdContent =
        '@startfpd\ntitle "Imported"\nproduct imp1 "Imported Product"\nprocess_operator ipo1 "Imported Op"\nimp1 --> ipo1\n@endfpd';

    const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('button[aria-label="Import FPD or XML file"]').click(),
    ]);

    await fileChooser.setFiles({
        name: 'test.fpd',
        mimeType: 'text/plain',
        buffer: Buffer.from(fpdContent),
    });

    await waitForDiagram(page);

    const elements = page.locator('svg[aria-label="FPD process diagram"] [data-element-id]');
    const count = await elements.count();
    expect(count).toBeGreaterThanOrEqual(2);
});

// ---- 5. Undo / Redo ----

test('undo button becomes enabled after editing', async ({ page }) => {
    // Initially undo should be disabled
    const undoButton = page.locator('button[aria-label="Undo"]');
    await expect(undoButton).toBeDisabled();

    // Type something to create a history entry
    await setEditorContent(page, FPD_SOURCE);
    // Wait for debounce + history push
    await page.waitForTimeout(1500);

    // Undo should now be enabled
    await expect(undoButton).toBeEnabled({ timeout: 5_000 });
});

test('redo works after undo', async ({ page }) => {
    const undoButton = page.locator('button[aria-label="Undo"]');
    const redoButton = page.locator('button[aria-label="Redo"]');

    // Type content to create history
    await setEditorContent(page, FPD_SOURCE);
    await page.waitForTimeout(1500);

    // Undo — redo should become enabled
    await undoButton.click();
    await expect(redoButton).toBeEnabled({ timeout: 5_000 });

    // Redo — redo should become disabled again
    await redoButton.click();
    await expect(redoButton).toBeDisabled({ timeout: 5_000 });
});

// ---- 6. Diagram element interaction ----

test('double-clicking a diagram element does not crash', async ({ page }) => {
    await setEditorContent(page, FPD_SOURCE);
    await waitForDiagram(page);

    const poElement = page
        .locator('svg[aria-label="FPD process diagram"] [data-element-type="processOperator"]')
        .first();
    await poElement.dblclick();

    // App should still be functional — editor and diagram visible
    await expect(page.locator('.monaco-editor')).toBeVisible();
    await expect(page.locator('svg[aria-label="FPD process diagram"]')).toBeVisible();
});

// ---- 7. Viewport controls ----

test('zoom controls are visible and interactive', async ({ page }) => {
    await setEditorContent(page, FPD_SOURCE);
    await waitForDiagram(page);

    await expect(page.locator('text=100%')).toBeVisible();

    await page.locator('button[aria-label="Zoom in"]').click();
    await expect(page.locator('text=110%')).toBeVisible();

    await page.locator('button[aria-label="Zoom out"]').click();
    await page.locator('button[aria-label="Zoom out"]').click();
    await expect(page.locator('text=90%')).toBeVisible();

    await page.locator('button[aria-label="Zoom to fit"]').click();
    const zoomText = await page.locator('.viewport-controls').textContent();
    const zoomPercent = parseInt(zoomText?.match(/(\d+)%/)?.[1] ?? '100');
    expect(zoomPercent).toBeLessThanOrEqual(100);
});
