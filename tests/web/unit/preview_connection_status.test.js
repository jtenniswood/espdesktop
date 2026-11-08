const test = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

test("card transfers preserve the connected preview while real disconnects remain visible", () => {
  loadTypescriptTest("tests/web/preview_connection_status.test.ts").runPreviewConnectionStatusTests();
});
