// FIXED variant.
(function () {
  const actions = document.getElementById("actions");
  const action = document.createElement("button");
  action.type = "button";
  action.className = "primary-action";
  action.textContent = "New note";
  action.addEventListener("click", () => { action.textContent = "New note (clicked)"; });
  actions.appendChild(action);

  fetch("/api/notes")
    .then((r) => r.json())
    .then((data) => {
      const body = document.querySelector(".notes-body");
      for (const n of data.notes) {
        const tr = document.createElement("tr");
        const tdBody = document.createElement("td");
        tdBody.className = "note-body";
        tdBody.textContent = n.body;
        const tdTag = document.createElement("td");
        tdTag.textContent = n.tag;
        tr.append(tdBody, tdTag);
        body.appendChild(tr);
      }
      if (data.notes.length === 0) {
        document.querySelector(".empty-note").hidden = false;
      }
    });
})();
