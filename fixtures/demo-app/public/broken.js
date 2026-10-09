// BROKEN variant: realistic mistakes, intentionally left in.
(function () {
  // Toolbar "button" is a div: clickable with a mouse, unreachable by keyboard.
  const tools = document.getElementById("tools");
  const tool = document.createElement("div");
  tool.className = "tool";
  tool.textContent = "Export board";
  tool.addEventListener("click", () => {
    tool.textContent = "Export board (clicked)";
  });
  tools.appendChild(tool);

  // Tasks: renders the list, but an empty API response renders nothing.
  fetch("/api/tasks")
    .then((r) => r.json())
    .then((data) => {
      const list = document.querySelector(".task-list");
      for (const t of data.tasks) {
        const li = document.createElement("li");
        const title = document.createElement("span");
        title.className = "task-title";
        title.textContent = t.title;
        const due = document.createElement("span");
        due.className = "task-due";
        due.textContent = t.due;
        li.append(title, due);
        list.appendChild(li);
      }
    });

  // Client-side filter (same plumbing in both variants).
  document.getElementById("filter").addEventListener("input", (event) => {
    const needle = event.target.value.toLowerCase();
    for (const li of document.querySelectorAll(".task-list li")) {
      li.hidden = !li.textContent.toLowerCase().includes(needle);
    }
  });

  // Stats: no loading state, no error handling; on failure it stays on
  // "Loading…" forever (unhandled rejection).
  fetch("/api/stats")
    .then((r) => r.json())
    .then((s) => {
      document.querySelector(".stats-body").textContent = `${s.done} / ${s.total} done`;
    });
})();
