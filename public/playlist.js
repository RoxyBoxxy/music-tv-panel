async function loadList() {
  const res = await fetch(`/api/playlists/${playlistId}/items`);
  const items = await res.json();
  const ul = document.getElementById("playlist");
  ul.innerHTML = "";
  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.artist || ""} - ${item.title || ""} [${item.genre || ""}]`;
    li.draggable = true;
    li.dataset.id = item.id;
    ul.appendChild(li);
  });
}

// Initialize SortableJS for drag and drop
document.addEventListener("DOMContentLoaded", () => {
  new Sortable(document.getElementById("playlist"), {
    animation: 150,
    ghostClass: "opacity-50",
  });
});

document.getElementById("save").addEventListener("click", async () => {
  const order = [...document.querySelectorAll("#playlist li")].map(li => Number(li.dataset.id));
  await fetch(`/api/playlists/${playlistId}/order`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order })
  });
  alert("Order saved");
});

loadList();
