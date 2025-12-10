const form = document.getElementById("addForm");
const statusEl = document.getElementById("addStatus");
const addStatusModal = document.getElementById("addStatusModal");
const addStatusClose = document.getElementById("addStatusClose");

function openAddModal() {
  if (!addStatusModal) return;
  // Prefer native dialog if supported
  if (typeof addStatusModal.showModal === "function") {
    addStatusModal.showModal();
  } else {
    addStatusModal.style.display = "block";
    addStatusModal.classList.remove("hidden");
  }
}

function closeAddModal() {
  if (!addStatusModal) return;
  if (typeof addStatusModal.close === "function") {
    addStatusModal.close();
  } else {
    addStatusModal.style.display = "none";
    addStatusModal.classList.add("hidden");
  }
}

if (addStatusClose) {
  addStatusClose.disabled = true;
  addStatusClose.addEventListener("click", () => {
    document.getElementById('url').value = '' 
    closeAddModal();
    loadVideos();
  });
}

if (form && statusEl) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(form).entries());

    // Open modal and show initial status
    statusEl.textContent = "Downloading and importing via yt-dlp...\n";
    openAddModal();

    try {
      const res = await fetch("/api/add-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      // If the server is updated to stream text logs, handle streaming here
      const contentType = res.headers.get("content-type") || "";

      if (res.body && !contentType.includes("application/json")) {
        // Stream text output (e.g. logs) into the <pre>
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          statusEl.textContent = buffer;
          statusEl.scrollTop = statusEl.scrollHeight;
          if (buffer.includes("SQLITE_CONSTRAINT: UNIQUE constraint failed: videos.path")) {
            statusEl.textContent += "\nError: Video already exists in the database\n";
            addStatusClose.disabled = false;
          }
          if (buffer.includes("=== DONE ===")) {
            addStatusClose.disabled = false;
          }
        }

        // We're done; don't try to parse JSON after streaming
        return;
      }

      // Fallback to original JSON behaviour if backend still returns JSON
      const json = await res.json();
      if (!json.ok) {
        statusEl.textContent += "\nError: " + json.error;
      } else {
        statusEl.textContent +=
          "\nAdded: " + json.video.artist + " - " + json.video.title;
        form.reset();
        addStatusClose.disabled = false;
      }
    } catch (err) {
      if (err.message.includes("SQLITE_CONSTRAINT")) {
        statusEl.textContent += "\nError: Video already exists in the database\n";
      } else {
        statusEl.textContent += "\nRequest failed: " + err.message;
      }
      addStatusClose.disabled = false;
    }
  });
}
