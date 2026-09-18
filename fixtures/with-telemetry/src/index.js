const { track } = require("./metrics");

async function main() {
  await track(process.argv[2] ?? "list");
  console.log("ok");
}

main();
