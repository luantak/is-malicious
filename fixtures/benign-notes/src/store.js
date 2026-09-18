const fs = require("node:fs/promises");
const path = require("node:path");

const FILE = path.join(process.cwd(), "notes.json");

async function loadNotes() {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function saveNotes(notes) {
  await fs.writeFile(FILE, JSON.stringify(notes, null, 2));
}

module.exports = { loadNotes, saveNotes };
