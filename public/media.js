async function loadVideos() {
  const res = await fetch("/api/videos");
  const videos = await res.json();
  const tbody = document.querySelector("#videosTable tbody");
  tbody.innerHTML = "";
  for (const v of videos) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.id}</td>
      <td>${v.title || "(no title)"}</td>
      <td>${v.artist || ""}</td>
      <td>${v.year || ""}</td>
      <td>${v.genre || ""}</td>
      <td>
        <input type="checkbox" ${v.is_ident ? "checked" : ""} data-id="${v.id}">
      </td>
      <td>${v.source_url ? `<a href="${v.source_url}" target="_blank">source</a>` : ""}</td>
      <td class="px-3 py-2 flex gap-2">
        <button data-id="${v.id}" class="editBtn px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">Edit</button>
        <button data-id="${v.id}" class="deleteBtn px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);

    tr.querySelector(".editBtn").addEventListener("click", () => {
      const id = v.id;

      // Fill modal
      document.getElementById("modalTitle").textContent = "Edit Video";
      document.getElementById("modalContent").innerHTML = `
        <div class="space-y-3">
          <label class="block text-sm font-medium">Title</label>
          <input id="edit_title" value="${v.title || ""}"
            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />

          <label class="block text-sm font-medium">Artist</label>
          <input id="edit_artist" value="${v.artist || ""}"
            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />

          <label class="block text-sm font-medium">Year</label>
          <input id="edit_year" value="${v.year || ""}"
            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />

          <label class="block text-sm font-medium">Genre</label>
          <input id="edit_genre" value="${v.genre || ""}"
            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />

          <label class="flex items-center gap-2 mt-2">
            <input id="edit_ident" type="checkbox" ${v.is_ident ? "checked" : ""}>
            Ident
          </label>
        </div>
      `;

      // Confirm button sends update
      document.getElementById("modalConfirm").onclick = async () => {
        await fetch(`/api/videos/${id}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: document.getElementById("edit_title").value,
            artist: document.getElementById("edit_artist").value,
            year: document.getElementById("edit_year").value,
            genre: document.getElementById("edit_genre").value,
            is_ident: document.getElementById("edit_ident").checked
          })
        });

        closeModal();
        loadVideos();
      };

      openModal();
    });

    tr.querySelector(".deleteBtn").addEventListener("click", () => {
      const id = v.id;

      document.getElementById("modalTitle").textContent = "Delete Video";
      document.getElementById("modalContent").innerHTML = `
        <p class="text-red-400">Are you sure you want to delete:<br>
        <strong>${v.title || "(no title)"}</strong>?</p>
      `;

      document.getElementById("modalConfirm").onclick = async () => {
        await fetch(`/api/videos/${id}`, { method: "DELETE" });
        closeModal();
        loadVideos();
      };

      openModal();
    });
  }

  tbody.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", async () => {
      const id = cb.dataset.id;
      await fetch(`/api/videos/${id}/ident`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_ident: cb.checked })
      });
    });
  });
}


async function loadPlaylists() {
  const res = await fetch("/api/playlists");
  const pls = await res.json();
  const container = document.getElementById("playlists");
  container.innerHTML = "";
  pls.forEach(p => {
    const div = document.createElement("div");
    div.innerHTML = `
      <strong>${p.name}</strong> - ${p.description || ""} 
      ${p.is_active ? "(active)" : ""}
      <a href="/playlists/${p.id}">Edit</a>
      <button data-id="${p.id}" class="activate-btn">Set active</button>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll(".activate-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      await fetch(`/api/playlists/${id}/activate`, { method: "POST" });
      loadPlaylists();
    });
  });
}

loadVideos();


function openModal() {
  document.getElementById("modalOverlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
}

document.getElementById("modalCancel").addEventListener("click", closeModal);
