const fs = require("fs");
const pkg = require("../package.json");

fs.writeFileSync("src/version.ts", `export const VERSION = '${pkg.version}';\n`);

// This value is injected by the release workflow from its GitHub Environment.
// A consumer may still override it with SERVER_BASE_URL at runtime.
const serverBaseUrl = process.env.SERVER_BASE_URL || "";
fs.writeFileSync(
    "src/build-config.ts",
    `export const BUILD_SERVER_BASE_URL = ${JSON.stringify(serverBaseUrl)};\n`
);
