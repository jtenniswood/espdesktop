const { test } = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { runPublicFirmwareCredentialsTest } = loadTypescriptTest("tests/web/public_firmware_credentials.test.ts");
test("web OTA downloads anonymously and authenticates the device upload", runPublicFirmwareCredentialsTest);
