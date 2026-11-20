const test = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

test("Apple Home page setup preserves the existing layout and respects capacity", () => {
  loadTypescriptTest("tests/web/apple_home_page.test.ts").runAppleHomePageTests();
});
