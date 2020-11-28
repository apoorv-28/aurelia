/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { strict as assert } from 'assert';
import * as playwright from 'playwright';
import type { ElementHandle, Page } from 'playwright';

const gridColCount = 6;

const browserTypes = ['chromium'/* , 'firefox', 'webkit' */] as const;
const baseUrl = 'http://localhost:9000/';

describe('benchmark', function () {

  async function setup(browserType: 'chromium' | 'firefox' | 'webkit') {
    const browser = await playwright[browserType].launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.waitForSelector('app div.grid');
    return { page, browser };
  }

  // browser+#records -> label -> measurement
  const measurements: Record<string, Record<string, number>> = Object.create(null);
  after(function () {
    console.table(measurements);
  });

  for (const browserType of browserTypes) {
    describe(browserType, function () {
      it.only('hundred', async function () {
        const measurement = measurements[`${browserType} - hundred`] = Object.create(null);
        const { page, browser } = await setup(browserType);

        await new PopulateHundred(page, measurement).run();
        await new UpdateEvery10thRow(page, measurement).run();
        await new ToggleDetails(page, measurement).run();
        await new ToggleLocale(page, measurement).run();
        await new FirstNameSort(page, measurement).run();
        await new LastNameSort(page, measurement).run();
        await new DobSort(page, measurement).run();
        await new Filter(page, measurement).run();
        await new SelectFirst(page, measurement).run();
        await new DeleteFirst(page, measurement).run();
        await new DeleteAll(page, measurement).run();

        await browser.close();
      });

      it('thousand', async function () {
        const measurement = measurements[`${browserType} - thousand`] = Object.create(null);
        const { page, browser } = await setup(browserType);

        await new PopulateThousand(page, measurement).run();
        await new UpdateEvery10thRow(page, measurement).run();
        await new ToggleDetails(page, measurement).run();
        await new ToggleLocale(page, measurement).run();
        await new FirstNameSort(page, measurement).run();
        await new LastNameSort(page, measurement).run();
        await new DobSort(page, measurement).run();
        await new Filter(page, measurement).run();
        await new SelectFirst(page, measurement).run();
        await new DeleteFirst(page, measurement).run();
        await new DeleteAll(page, measurement).run();

        await browser.close();
      });

      it.skip('ten-thousand', async function () {
        const measurement = measurements[`${browserType} - ten-thousand`] = Object.create(null);
        const { page, browser } = await setup(browserType);

        await new PopulateTenThousand(page, measurement).run();
        await new UpdateEvery10thRow(page, measurement).run();
        await new ToggleDetails(page, measurement).run();
        await new ToggleLocale(page, measurement).run();
        await new FirstNameSort(page, measurement).run();
        await new LastNameSort(page, measurement).run();
        await new DobSort(page, measurement).run();
        await new Filter(page, measurement).run();
        await new SelectFirst(page, measurement).run();
        await new DeleteFirst(page, measurement).run();
        await new DeleteAll(page, measurement).run();

        await browser.close();
      });
    });
  }
});

abstract class BaseActMeasureAssert<TPreState = unknown> {
  public constructor(
    public readonly label: string,
    public readonly selector: string,
    public readonly page: Page,
    public readonly measurement: Record<string, number>,
  ) { }

  // Act, measures, and asserts
  public async run() {
    const label = this.label;
    console.log(`starting ${label}`);

    const preState = await this.getPreRunState();

    await this.actAndMeasure(label);

    await this.assert(preState);
    console.log(`finished ${label}`);
  }

  protected abstract getPreRunState(): Promise<TPreState>;
  protected abstract assert(preState: TPreState): Promise<void>;

  protected async actAndMeasure(label: string, $selector = this.selector) {
    const duration = await this.page.evaluate(async (selector: string) => {
      const start = performance.now();
      document.querySelector<HTMLElement>(selector)!.click();
      await (globalThis as any).waitForIdle();
      return performance.now() - start;
    }, $selector);
    this.measurement[label] = Math.round(duration * 1e3) / 1e3;
  }

  public async getGridContent(): Promise<ElementHandle<SVGElement | HTMLElement>[]> {
    // get the content without the header
    return (await this.page.$$('div.grid>*')).slice(gridColCount);
  }
}

abstract class BaseMultiStateActMeasureAssert<
  TStates extends readonly string[] = readonly string[],
  TPreState = unknown
  > extends BaseActMeasureAssert<TPreState> {

  public abstract stateNames: TStates;
  private _currentState!: TStates[number];

  public constructor(
    label: string,
    selector: string,
    page: Page,
    measurement: Record<string, number>,
  ) {
    super(label, selector, page, measurement);
  }
  public get currentState() { return this._currentState; }

  public async run() {
    /* eslint-disable no-await-in-loop */
    for (const state of this.stateNames) {
      this._currentState = state;
      const label = `${this.label} - ${state}`;

      console.log(`starting ${label}`);

      const preState = await this.getPreRunState();

      await this.actAndMeasure(label);

      await this.assert(preState);
      console.log(`finished ${label}`);
    }
    /* eslint-enable no-await-in-loop */
  }
}

class Populate extends BaseActMeasureAssert {

  public constructor(
    label: string,
    selector: string,
    page: Page,
    measurement: Record<string, number>,
    public readonly population: number,
  ) {
    super(label, selector, page, measurement);
  }

  protected async getPreRunState(): Promise<ElementHandle<SVGElement | HTMLElement>[]> {
    return this.getGridContent();
  }

  protected async assert(preState: ElementHandle<SVGElement | HTMLElement>[]): Promise<void> {
    const currentRowCount = (await this.getGridContent()).length / gridColCount;
    const previousRowCount = preState.length / gridColCount;

    if (previousRowCount > this.population) {
      assert.strictEqual(currentRowCount, previousRowCount, 'invariant row count');
    } else {
      assert.strictEqual(currentRowCount, this.population, 'exact row count');
    }
  }
}

class PopulateHundred extends Populate {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('hundred', 'button#hundred', page, measurement, 100);
  }
}

class PopulateThousand extends Populate {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('thousand', 'button#thousand', page, measurement, 1_000);
  }
}

class PopulateTenThousand extends Populate {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('ten-thousand', 'button#ten-thousand', page, measurement, 10_000);
  }
}

class DeleteFirst extends BaseActMeasureAssert {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('delete first', 'span.delete', page, measurement);
  }

  protected async getPreRunState(): Promise<ElementHandle<SVGElement | HTMLElement>[]> {
    return this.getGridContent();
  }

  protected async assert(preState: ElementHandle<SVGElement | HTMLElement>[]): Promise<void> {
    const currentRowCount = (await this.getGridContent()).length / gridColCount;
    const previousRowCount = preState.length / gridColCount;
    assert.strictEqual(currentRowCount, previousRowCount - 1, 'delete-first');
  }
}

class DeleteAll extends BaseActMeasureAssert {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('delete all', 'button#remove-all', page, measurement);
  }

  protected async getPreRunState(): Promise<ElementHandle<SVGElement | HTMLElement>[]> {
    return this.getGridContent();
  }

  protected async assert(_preState: ElementHandle<SVGElement | HTMLElement>[]): Promise<void> {
    const currentRowCount = (await this.getGridContent()).length / gridColCount;
    assert.strictEqual(currentRowCount, 0, 'delete-all');
  }
}

class ToggleDetails extends BaseMultiStateActMeasureAssert<readonly ['show', 'hide']> {
  public stateNames = ['show', 'hide'] as const;
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('toggle details', 'button#details', page, measurement);
  }

  protected getPreRunState(): Promise<ElementHandle<SVGElement | HTMLElement>[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.page.$$('div.grid>address-viewer');
  }

  protected async assert(_preState: ElementHandle<SVGElement | HTMLElement>[]): Promise<void> {
    const page = this.page;
    switch (this.currentState) {
      case 'show': {
        assert.strictEqual((await page.$$('div.grid>address-viewer>div')).length > 0, true, 'show div');
        assert.strictEqual((await page.$$('div.grid>address-viewer>ul')).length, 0, 'no ul');
        break;
      }
      case 'hide': {
        assert.strictEqual((await page.$$('div.grid>address-viewer>ul')).length > 0, true, 'show ul');
        assert.strictEqual((await page.$$('div.grid>address-viewer>div')).length, 0, 'no div');
        break;
      }
    }
  }
}

class ToggleLocale extends BaseMultiStateActMeasureAssert<readonly ['de', 'en']> {
  public stateNames = ['de', 'en'] as const;
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('toggle localize-date', 'button#locale', page, measurement);
  }

  protected getPreRunState(): Promise<undefined> {
    return undefined!;
  }

  protected async assert(_preState: undefined): Promise<void> {
    const page = this.page;
    const dates = await Promise.all((await page.$$('div.grid>span:nth-child(6n+3)')).map((el) => el.textContent()));
    // rudimentary date validation, as the main objective is to assert the locale specific artifacts
    switch (this.currentState) {
      case 'de':
        assert.strictEqual(dates.every((d) => /[0-3]?[0-9]\.[0-1]?[0-9]\.\d{4}/.test(d!)), true, 'localize date - de');
        break;
      case 'en':
        assert.strictEqual(dates.every((d) => /[0-1]?[0-9]\/[0-3]?[0-9]\/\d{4}/.test(d!)), true, 'localize date - en');
        break;
    }
  }
}

class Filter extends BaseActMeasureAssert {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('', '', page, measurement);
  }

  public async run() {
    const selector = 'div.grid>span:nth-child(6n+4)';
    const page = this.page;

    // #region filter - employed
    let label = 'filter - employed';
    console.log(`starting ${label}`);

    let previous = await page.$$(selector);
    const all = previous;

    await this.actAndMeasure(label, 'button#employed');

    let current = await page.$$(selector);

    assert.strictEqual(current.length <= all.length, true, `${label} - count`);
    assert.strictEqual((await Promise.all(current.map((e) => e.textContent()))).every((t) => !!t), true, `${label} - content`);
    console.log(`finished ${label}`);
    // #endregion

    // #region filter - unemployed
    label = 'filter - unemployed';
    console.log(`starting ${label}`);

    previous = current;

    await this.actAndMeasure(label, 'button#unemployed');

    current = await page.$$(selector);

    assert.notEqual(current.length <= all.length, `${label} - count`);
    assert.strictEqual((await Promise.all(current.map((e) => e.textContent()))).every((t) => !t), true, `${label} - content`);
    console.log(`finished ${label}`);
    // #endregion

    // #region filter - no
    label = 'filter - no';
    console.log(`starting ${label}`);

    previous = current;

    await this.actAndMeasure(label, 'button#all');

    current = await page.$$(selector);

    assert.notEqual(current.length >= previous.length, `${label} - count`);
    assert.deepStrictEqual(
      await Promise.all(current.map((e) => e.textContent())),
      await Promise.all(all.map((e) => e.textContent())),
      `${label} - content`
    );
    console.log(`finished ${label}`);
    // #endregion
  }

  protected getPreRunState(): Promise<undefined> {
    return undefined!;
  }

  protected async assert(_preState: undefined): Promise<void> {
    return undefined!;
  }
}

class Sort extends BaseMultiStateActMeasureAssert<readonly ['asc', 'desc']> {
  public stateNames = ['asc', 'desc'] as const;
  public constructor(
    label: string,
    selector: string,
    page: Page,
    measurement: Record<string, number>,
    public readonly colSelector: string,
  ) {
    super(label, selector, page, measurement);
  }

  protected getPreRunState(): Promise<(string | null)[]> {
    return this.getColContent();
  }

  protected async assert(_preState: ElementHandle<SVGElement | HTMLElement>[]): Promise<void> {
    const content = await this.getColContent();
    let direction: number;
    switch (this.currentState) {
      case 'asc':
        direction = 1;
        break;
      case 'desc':
        direction = -1;
        break;
    }

    const sorted = content.slice(0).sort((a, b) => direction * a!.localeCompare(b!));
    assert.deepStrictEqual(content, sorted, `${this.label} ${this.currentState} - content`);
  }

  protected async getColContent() {
    return Promise.all((await this.page.$$(this.colSelector)).map((i) => i.textContent()));
  }
}

class FirstNameSort extends Sort {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('sort by firstName', 'div.grid>strong:nth-of-type(1)', page, measurement, 'div.grid>span:nth-child(6n+1)');
  }
}

class LastNameSort extends Sort {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('sort by lastName', 'div.grid>strong:nth-of-type(2)', page, measurement, 'div.grid>span:nth-child(6n+2)');
  }
}

class DobSort extends Sort {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('sort by dob', 'div.grid>strong:nth-of-type(3)', page, measurement, 'div.grid>span:nth-child(6n+3)');
  }

  protected async assert(_preState: ElementHandle<SVGElement | HTMLElement>[]): Promise<void> {
    const content = (await this.getColContent()).map((dateStr) => {
      const [mm, dd, yyyy] = dateStr!.split('/');
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    });
    let direction: number;
    switch (this.currentState) {
      case 'asc':
        direction = 1;
        break;
      case 'desc':
        direction = -1;
        break;
    }

    const sorted = content.slice(0).sort((a, b) => direction * (a.getTime() - b.getTime()));
    assert.deepStrictEqual(content, sorted, `${this.label} ${this.currentState} - content`);
  }
}

class SelectFirst extends BaseActMeasureAssert {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('select first', 'div.grid>span.selection-target', page, measurement);
  }
  protected async getPreRunState(): Promise<void> {
    assert.deepStrictEqual(
      await this.getInfo(),
      [
        ['false', 'rgba(0, 0, 0, 0)'],
        ['rgba(0, 0, 0, 0)'],
      ]
    );
  }

  protected async assert(): Promise<void> {
    assert.deepStrictEqual(
      await this.getInfo(),
      [
        ['true', 'rgb(153, 153, 153)'],
        ['rgb(153, 153, 153)'],
      ]
    );
  }

  private async getInfo() {
    return this.page.evaluate(() => {
      const cell1 = document.querySelector<HTMLSpanElement>('div.grid>span.selection-target')!;
      const cell2 = cell1.nextElementSibling! as HTMLSpanElement;
      return [
        [cell1.dataset['selected'], getComputedStyle(cell1).backgroundColor],
        [getComputedStyle(cell2).backgroundColor],
      ] as const;
    });
  }
}

class UpdateEvery10thRow extends BaseActMeasureAssert {
  public constructor(
    page: Page,
    measurement: Record<string, number>,
  ) {
    super('update every 10th row', 'button#update-10', page, measurement);
  }
  protected async getPreRunState(): Promise<(string | null)[]> {
    return this.getFirstNameCol();
  }

  protected async assert(preState: (string | null)[]): Promise<void> {
    const current = await this.getFirstNameCol();
    for (let i = 0, ii = current.length; i < ii; i += 10) {
      assert.strictEqual(current[i], `${preState[i]} !!!`, `content ${i}`);
    }
  }

  private async getFirstNameCol() {
    return Promise.all((await this.page.$$('div.grid>span:nth-child(6n+1)')).map((el) => el.textContent()));
  }
}
