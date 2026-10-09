// FIXED variant: same app, resilient behavior.
(function () {
  const tools = document.getElementById("tools");
  const tool = document.createElement("button");
  tool.type = "button";
  tool.className = "tool";
  tool.textContent = "Export board";
  tool.addEventListener("click", () => {
    tool.textContent = "Export board (clicked)";
  });
  tools.appendChild(tool);

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
      // Empty data is a valid state: say so instead of rendering nothing.
      if (data.tasks.length === 0) {
        document.querySelector(".empty-state").hidden = false;
      }
    });

  // Client-side filter (same plumbing in both variants).
  document.getElementById("filter").addEventListener("input", (event) => {
    const needle = event.target.value.toLowerCase();
    for (const li of document.querySelectorAll(".task-list li")) {
      li.hidden = !li.textContent.toLowerCase().includes(needle);
    }
  });

  const body = document.querySelector(".stats-body");
  body.textContent = "";
  const skeleton = document.createElement("span");
  skeleton.className = "loading";
  skeleton.setAttribute("aria-hidden", "true");
  skeleton.textContent = "Loading…";
  body.appendChild(skeleton);
  fetch("/api/stats")
    .then((r) => {
      if (!r.ok) throw new Error("stats failed");
      return r.json();
    })
    .then((s) => {
      body.textContent = `${s.done} / ${s.total} done`;
    })
    .catch(() => {
      body.textContent = "";
      const err = document.createElement("span");
      err.className = "stats-error";
      err.textContent = "Stats unavailable.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "retry-stats";
      retry.textContent = "Retry";
      body.append(err, " ", retry);
    });
})();
