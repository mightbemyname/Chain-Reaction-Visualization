import { test, expect, type Page } from '@playwright/test';

async function tapElement(page: Page, id: string, edge = false) {
  const point = await page.locator('.graph-canvas').evaluate((el, arg) => {
    const cy = (el as HTMLElement & { _cyreg: { cy: import('cytoscape').Core } })._cyreg.cy;
    const element = (arg.edge ? cy.edges() : cy.nodes()).filter(e => e.data(arg.edge ? 'editId' : 'originalId') === arg.id).first();
    return arg.edge ? element.renderedMidpoint() : element.renderedPosition();
  }, { id, edge });
  await page.locator('.graph-canvas').click({ position: point });
}

test('editor, exact workers, comparisons, simulation, sharing and persistence', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.canvas-header')).toContainText('14 nodes');
  await expect(page.locator('.stats-panel .method-badge')).toHaveText('EXACT');
  await page.screenshot({ path: 'docs/screenshot.png', fullPage: true });
  await page.getByRole('button', { name: 'Diamond', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('0.694%');
  await page.getByRole('button', { name: 'Behind the maths' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await expect(page.locator('tfoot')).toContainText('100%');
  await page.locator('tbody tr').nth(2).click();
  await expect(page.getByRole('button', { name: 'Clear highlight' })).toBeVisible();
  await page.getByRole('button', { name: 'Triangle', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('2.8%');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('0.694%');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('2.8%');
  await page.getByLabel('Exact value (%)', { exact: true }).fill('100');
  await expect(page.locator('.stat-hero strong')).toHaveText('100%');
  await page.getByRole('button', { name: 'Asplode!' }).click();
  await expect(page.locator('.playback-title small')).toContainText('3 of 3 active');
  await page.getByLabel('Exact value (%)', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Compare probabilities' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.getByRole('checkbox', { name: 'Overlay 50%' }).check();
  await page.getByRole('button', { name: 'Distribution', exact: true }).click();
  await expect(page.locator('.recharts-legend-wrapper')).toContainText('p = 50%');
  await page.getByText('Calculation & simulation', { exact: true }).click();
  await page.getByLabel('RANDOM SEED · OPTIONAL').fill('test-lab');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/10,000 trials · P\(all\)/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('activation-distribution.csv');
  await page.reload();
  await expect(page.locator('.stat-hero strong')).toHaveText('2.8%');
  await expect(page.locator('.canvas-header')).toContainText('3 nodes');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Share graph', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Graph link copied');
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  expect(shared).toContain('#graph=');
  await page.getByRole('button', { name: 'Diamond', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('0.694%');
  await page.goto(shared);
  await expect(page.locator('.stat-hero strong')).toHaveText('2.8%');
  expect(errors).toEqual([]);
});

test('canvas addition and deletion, large graph fallback, mobile fit', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Empty', exact: true }).click();
  await page.getByRole('button', { name: 'Add a node', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('100%');
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await page.locator('.graph-canvas').click({ position: { x: 200, y: 200 } });
  await expect(page.locator('.canvas-header')).toContainText('2 nodes');
  await expect(page.locator('.stat-hero strong')).toHaveText('0%');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('100%');
  await page.getByLabel('Preset node count').fill('20');
  await page.getByRole('button', { name: 'Chain', exact: true }).click();
  await expect(page.locator('.stats-panel .method-badge')).toHaveText('MONTE CARLO');
  await expect(page.locator('.canvas-header')).toContainText('20 nodes');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.graph-canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Diamond', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('0.694%');
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await page.screenshot({ path: 'docs/mobile-screenshot.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('connection edits, directed overrides, source changes and imported ID safety', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Triangle', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('2.8%');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await tapElement(page, '1'); await tapElement(page, '2');
  await expect(page.locator('.canvas-header')).toContainText('2 connections');
  await expect(page.locator('.stat-hero strong')).toHaveText('1%');
  await tapElement(page, '1'); await tapElement(page, '2');
  await expect(page.locator('.stat-hero strong')).toHaveText('2.8%');
  await page.getByLabel('CONNECTION MODE').selectOption('directed');
  await expect(page.locator('.canvas-header')).toContainText('6 connections');
  const config = { version: 1, graph: {
    mode: 'directed', probability: .1, source: 'edge:e1:f',
    nodes: [{ id: 'edge:e1:f', x: 100, y: 200 }, { id: 'e2', x: 400, y: 200 }],
    edges: [{ id: 'e1', source: 'edge:e1:f', target: 'e2', probability: .6 }],
  } };
  await page.locator('input[type=file]').setInputFiles({ name: 'special-ids.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
  await expect(page.locator('.stat-hero strong')).toHaveText('60%');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await tapElement(page, 'e1', true);
  await expect(page.getByRole('checkbox', { name: 'Override probability', exact: true })).toBeChecked();
  await page.getByLabel('Transmission (%)', { exact: true }).fill('25');
  await expect(page.locator('.stat-hero strong')).toHaveText('25%');
  await page.getByRole('button', { name: 'Set source', exact: true }).click();
  await tapElement(page, 'e2');
  await expect(page.locator('.stat-hero strong')).toHaveText('0%');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await tapElement(page, 'edge:e1:f');
  await expect(page.locator('.canvas-header')).toContainText('1 nodes');
  await expect(page.locator('.stat-hero strong')).toHaveText('100%');
  expect(errors).toEqual([]);
});

test('long simulations remain responsive and can be cancelled', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Preset node count').fill('40');
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await page.getByText('Calculation & simulation', { exact: true }).click();
  await page.getByLabel('Trial count', { exact: true }).fill('1000000');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect.poll(() => page.locator('.settings-details progress').evaluate((el: HTMLProgressElement) => el.value)).toBeGreaterThan(0);
  await page.locator('.stats-panel').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Simulation cancelled.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Diamond', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('0.694%');
});

for (const simulated of [false, true]) {
  test(`node-count changes at the exact limit stay usable (${simulated ? 'with simulation' : 'exact only'})`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await page.getByLabel('Preset node count').fill('13');
    await page.getByRole('button', { name: 'Chain', exact: true }).click();
    await expect(page.locator('.stats-panel .method-badge')).toHaveText('EXACT');
    if (simulated) {
      await page.getByText('Calculation & simulation', { exact: true }).click();
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await expect(page.getByText(/10,000 trials · P\(all\)/)).toBeVisible();
    }
    await page.getByRole('button', { name: 'Add node', exact: true }).click();
    for (let count = 14; count <= 25; count++) {
      const index = count - 14;
      await page.locator('.graph-canvas').click({ position: { x: 170 + (index % 6) * 80, y: 170 + Math.floor(index / 6) * 210 } });
      await expect(page.locator('.canvas-header')).toContainText(`${count} nodes`);
      await expect(page.locator('.stats-panel .method-badge')).toHaveText(count === 14 ? 'EXACT' : 'MONTE CARLO');
      expect(errors).toEqual([]);
    }
    await page.reload();
    await expect(page.locator('.canvas-header')).toContainText('25 nodes');
    await expect(page.locator('.stats-panel .method-badge')).toHaveText('MONTE CARLO');
    expect(errors).toEqual([]);
  });
}

test('default Reddit graph, adaptive legend, resize handle and 5×5 grid', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.canvas-header')).toContainText('14 nodes');
  await expect(page.locator('.canvas-header')).toContainText('29 connections');
  await expect(page.getByLabel('CONNECTION MODE')).toHaveValue('symmetric');
  await expect(page.locator('.stats-panel .method-badge')).toHaveText('EXACT');
  await expect(page.locator('.canvas-legend')).toContainText('source excluded');
  await expect(page.locator('.legend-values span').last()).not.toHaveText('100%');
  await expect(page.locator('.stat-hero strong')).toHaveText('0.000006679%');
  await expect(page.locator('.inverse-odds')).toHaveText('≈ 1 in 15 million');
  const sourceColour = await page.locator('.graph-canvas').evaluate(el => {
    const cy = (el as HTMLElement & { _cyreg: { cy: import('cytoscape').Core } })._cyreg.cy;
    return cy.nodes('.source').style('background-color');
  });
  expect(sourceColour).toBe('rgb(251,191,36)');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chain-reaction-lab-v1')!).graph);
  const source = saved.nodes.find((n: { id: string }) => n.id === saved.source);
  expect(source.x).toBe(Math.min(...saved.nodes.map((n: { x: number }) => n.x)));
  const box = (await page.locator('.canvas-body').boundingBox())!;
  await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
  await page.mouse.down(); await page.mouse.move(box.x + box.width - 3, box.y + box.height + 110, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => page.locator('.canvas-body').evaluate(el => el.clientHeight)).toBeGreaterThan(box.height + 80);
  await page.getByLabel('Preset node count').fill('25');
  await page.getByRole('button', { name: 'Square grid', exact: true }).click();
  await expect(page.locator('.canvas-header')).toContainText('25 nodes');
  await expect(page.locator('.canvas-header')).toContainText('40 connections');
  await expect(page.locator('.stats-panel .method-badge')).toHaveText('MONTE CARLO');
  expect(errors).toEqual([]);
});
