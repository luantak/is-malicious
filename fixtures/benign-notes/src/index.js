const { loadNotes, saveNotes } = require("./store");

async function main() {
  const command = process.argv[2] ?? "list";
  const notes = await loadNotes();

  if (command === "add") {
    notes.push({ text: process.argv.slice(3).join(" "), createdAt: new Date().toISOString() });
    await saveNotes(notes);
    console.log("saved");
    return;
  }

  for (const note of notes) {
    console.log(`${note.createdAt}  ${note.text}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
