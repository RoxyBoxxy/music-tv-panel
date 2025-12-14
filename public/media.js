let currentPage = 1;
const PAGE_SIZE = 25;
let totalPages = 1;

let currentSearch = "";
let currentSource = "";

async function loadVideos(page = 1) {
  currentPage = page;

  const params = new URLSearchParams({
    page: String(currentPage),
    limit: String(PAGE_SIZE)
  });

  if (currentSearch) params.set("q", currentSearch);
  if (currentSource) params.set("source", currentSource);

  const res = await fetch(`/api/videos?${params}`);
  const data = await res.json();

  const { rows, total, pages } = data;
  totalPages = pages;

  const tbody = document.getElementById("videosTableBody");
  tbody.innerHTML = "";

  for (const v of rows) {
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

    // --- existing edit / delete / checkbox handlers (unchanged) ---

    tr.querySelector(".editBtn").addEventListener("click", () => {
      const id = v.id;
      document.getElementById("modalTitle").textContent = "Edit Video";
      document.getElementById("modalContent").innerHTML = `
        <div class="space-y-3">
          <label class="block text-sm font-medium">Title</label>
          <input id="edit_title" value="${v.title || ""}" class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
          <label class="block text-sm font-medium">Artist</label>
          <input id="edit_artist" value="${v.artist || ""}" class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
          <label class="block text-sm font-medium">Year</label>
          <input id="edit_year" value="${v.year || ""}" class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
          <label class="block text-sm font-medium">Genre</label>
          <input id="edit_genre" value="${v.genre || ""}" class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
          <label class="flex items-center gap-2 mt-2">
            <input id="edit_ident" type="checkbox" ${v.is_ident ? "checked" : ""}> Ident
          </label>
                    <button id="modalGrab" class="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm">Grab Metadata</button>

        </div>
      `;

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
        loadVideos(currentPage);
      };

      openModal();

      const grabBtn = document.getElementById("modalGrab");
      if (grabBtn) {
        grabBtn.onclick = async () => {
          const urlencoded = new URLSearchParams();
          urlencoded.append("artist", document.getElementById("edit_artist").value);
          urlencoded.append("track", document.getElementById("edit_title").value);

          const requestOptions = {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: urlencoded,
            redirect: "follow"
          };

          const response = await fetch("/api/grab", requestOptions);
          const result = await response.json();

          if (result.year !== undefined) {
            document.getElementById("edit_year").value = result.year;
          }
          if (result.genre !== undefined) {
            document.getElementById("edit_genre").value = result.genre;
          }
        };
      }
    });



    tr.querySelector(".deleteBtn").addEventListener("click", () => {
      const id = v.id;
      document.getElementById("modalTitle").textContent = "Delete Video";
      document.getElementById("modalContent").innerHTML = `
        <p class="text-red-400">Are you sure you want to delete:<br><strong>${v.title || "(no title)"}</strong>?</p>
      `;
      document.getElementById("modalConfirm").onclick = async () => {
        await fetch(`/api/videos/${id}`, { method: "DELETE" });
        closeModal();
        loadVideos(currentPage);
      };
      openModal();
    });
  }

  // Ident checkbox handler
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

  updatePagination(total, currentPage, totalPages);
}

function updatePagination(total, page, pages) {
  const info = document.getElementById("videoPageInfo");
  const prev = document.getElementById("videoPrev");
  const next = document.getElementById("videoNext");

  if (!info || !prev || !next) return;

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  info.textContent = `Showing ${start}–${end} of ${total}`;
  prev.disabled = page <= 1;
  next.disabled = page >= pages;
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

document.getElementById("videoPrev")?.addEventListener("click", () => {
  if (currentPage > 1) loadVideos(currentPage - 1);
});

document.getElementById("videoNext")?.addEventListener("click", () => {
  if (currentPage < totalPages) loadVideos(currentPage + 1);
});

loadVideos();


function openModal() {
  document.getElementById("modalOverlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
}

document.getElementById("modalCancel").addEventListener("click", closeModal);

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("videoSearch");
  const sourceFilter = document.getElementById("videoSourceFilter");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      currentSearch = searchInput.value.trim();
      currentPage = 1;
      loadVideos(1);
    });
  }

  if (sourceFilter) {
    sourceFilter.addEventListener("change", () => {
      currentSource = sourceFilter.value;
      currentPage = 1;
      loadVideos(1);
    });
  }
});