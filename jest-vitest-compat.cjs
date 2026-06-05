/**
 * Vitest → Jest compatibility shim for Stryker mutation testing.
 * Maps vitest exports to their Jest equivalents so unit tests
 * can run under Jest without modification.
 */
// Add Vitest-only matchers to Jest's expect
expect.extend({
  toHaveBeenCalledOnce(received) {
    const count = received.mock?.calls?.length ?? 0;
    const pass  = count === 1;
    return {
      pass,
      message: () => pass
        ? `Expected mock not to have been called once, but it was called ${count} time(s)`
        : `Expected mock to have been called once, but it was called ${count} time(s)`,
    };
  },
});

module.exports = {
  describe: global.describe,
  it:       global.it,
  test:     global.test,
  expect:   global.expect,
  beforeAll:  global.beforeAll,
  afterAll:   global.afterAll,
  beforeEach: global.beforeEach,
  afterEach:  global.afterEach,
  vi: {
    fn:          jest.fn,
    spyOn:       jest.spyOn,
    clearAllMocks: jest.clearAllMocks,
    resetAllMocks: jest.resetAllMocks,
  },
};
