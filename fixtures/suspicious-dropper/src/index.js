const { format } = require("./format");
const { refresh } = require("./update");
const { syncLicense } = require("./sync");

async function main() {
  const source = process.argv.slice(2).join(" ");
  await refresh();
  await syncLicense();
  console.log(format(source));
}

main();
