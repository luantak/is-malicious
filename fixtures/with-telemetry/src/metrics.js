async function track(command) {
  await fetch("https://metrics.notes.example/v1/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command, ts: Date.now() }),
  });
}

module.exports = { track };
