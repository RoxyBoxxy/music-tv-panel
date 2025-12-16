(()=>{(()=>{let $=window.location.pathname||"/";document.addEventListener("DOMContentLoaded",()=>{if($==="/"&&k(),$.startsWith("/media")){let r=_();M(r?.reloadVideos)}$.startsWith("/users")&&O(),$.startsWith("/playlists/")&&P()});function k(){r(),o(),c();function r(){let n=document.querySelector("#videosTable tbody"),d=document.getElementById("modalOverlay"),u=document.getElementById("modalCancel"),a=document.getElementById("modalTitle"),i=document.getElementById("modalContent"),s=document.getElementById("modalConfirm");if(!n||!d||!a||!i||!s)return;async function p(){let v=await(await fetch("/api/videos")).json();n.innerHTML="",v.forEach(e=>{let b=document.createElement("tr");b.innerHTML=`
            <td>${e.id}</td>
            <td>${e.title||"(no title)"}</td>
            <td>${e.artist||""}</td>
            <td>${e.year||""}</td>
            <td>${e.genre||""}</td>
            <td>
              <input type="checkbox" ${e.is_ident?"checked":""} data-id="${e.id}">
            </td>
            <td>${e.source_url?`<a href="${e.source_url}" target="_blank">source</a>`:""}</td>
            <td class="px-3 py-2 flex gap-2">
              <button data-id="${e.id}" class="editBtn px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">Edit</button>
              <button data-id="${e.id}" class="deleteBtn px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Delete</button>
            </td>
          `,n.appendChild(b),b.querySelector(".editBtn").addEventListener("click",()=>{a.textContent="Edit Video",i.innerHTML=`
              <div class="space-y-3">
                <label class="block text-sm font-medium">Title</label>
                <input id="edit_title" value="${e.title||""}"
                  class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
                <label class="block text-sm font-medium">Artist</label>
                <input id="edit_artist" value="${e.artist||""}"
                  class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
                <label class="block text-sm font-medium">Year</label>
                <input id="edit_year" value="${e.year||""}"
                  class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
                <label class="block text-sm font-medium">Genre</label>
                <input id="edit_genre" value="${e.genre||""}"
                  class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
                <label class="flex items-center gap-2 mt-2">
                  <input id="edit_ident" type="checkbox" ${e.is_ident?"checked":""}>
                  Ident
                </label>
              </div>
            `,s.onclick=async()=>{await fetch(`/api/videos/${e.id}/edit`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:document.getElementById("edit_title").value,artist:document.getElementById("edit_artist").value,year:document.getElementById("edit_year").value,genre:document.getElementById("edit_genre").value,is_ident:document.getElementById("edit_ident").checked})}),y(),p()},m()}),b.querySelector(".deleteBtn").addEventListener("click",()=>{a.textContent="Delete Video",i.innerHTML=`
              <p class="text-red-400">Are you sure you want to delete:<br>
              <strong>${e.title||"(no title)"}</strong>?</p>
            `,s.onclick=async()=>{await fetch(`/api/videos/${e.id}`,{method:"DELETE"}),y(),p()},m()})}),n.querySelectorAll("input[type=checkbox]").forEach(e=>{e.addEventListener("change",async()=>{let b=e.dataset.id;await fetch(`/api/videos/${b}/ident`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_ident:e.checked})})})})}function m(){d.classList.remove("hidden")}function y(){d.classList.add("hidden")}u?.addEventListener("click",y),p()}function o(){let n=document.getElementById("nowPlaying");if(!n)return;async function d(){let a=await(await fetch("/api/now-playing")).json();n.textContent=JSON.stringify(a,null,2)}d(),setInterval(d,5e3)}function c(){let n=document.getElementById("playlists"),d=document.getElementById("newPlaylistForm");if(!n&&!d)return;async function u(){if(!n)return;let i=await(await fetch("/api/playlists")).json();n.innerHTML="",i.forEach(s=>{let p=document.createElement("div");p.innerHTML=`
            <strong>${s.name}</strong> - ${s.description||""} 
            ${s.is_active?"(active)":""}
            <a href="/playlists/${s.id}">Edit</a>
            <button data-id="${s.id}" class="activate-btn">Set active</button>
          `,n.appendChild(p)}),n.querySelectorAll(".activate-btn").forEach(s=>{s.addEventListener("click",async()=>{let p=s.dataset.id;await fetch(`/api/playlists/${p}/activate`,{method:"POST"}),u()})})}d?.addEventListener("submit",async a=>{a.preventDefault();let i=Object.fromEntries(new FormData(d).entries());await fetch("/api/playlists",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(i)}),d.reset(),u()}),u()}}function _(){let r=document.getElementById("videosTableBody");if(!r)return null;let o=1,c=25,n=1,d="",u="",a=document.getElementById("videoPageInfo"),i=document.getElementById("videoPrev"),s=document.getElementById("videoNext"),p=document.getElementById("videoSearch"),m=document.getElementById("videoSourceFilter"),y=document.getElementById("modalOverlay"),L=document.getElementById("modalCancel"),v=document.getElementById("modalTitle"),e=document.getElementById("modalContent"),b=document.getElementById("modalConfirm");p?.addEventListener("input",()=>{d=p.value.trim(),o=1,E(1)}),m?.addEventListener("change",()=>{u=m.value,o=1,E(1)}),i?.addEventListener("click",()=>{o>1&&E(o-1)}),s?.addEventListener("click",()=>{o<n&&E(o+1)}),L?.addEventListener("click",()=>y?.classList.add("hidden")),E();function E(t=1){o=t;let f=new URLSearchParams({page:String(o),limit:String(c)});d&&f.set("q",d),u&&f.set("source",u),fetch(`/api/videos?${f}`).then(x=>x.json()).then(x=>{let{rows:B,total:I,pages:N}=x;n=N,r.innerHTML="",B.forEach(l=>{let w=document.createElement("tr");w.innerHTML=`
              <td>${l.id}</td>
              <td>${l.title||"(no title)"}</td>
              <td>${l.artist||""}</td>
              <td>${l.year||""}</td>
              <td>${l.genre||""}</td>
              <td>
                <input type="checkbox" ${l.is_ident?"checked":""} data-id="${l.id}">
              </td>
              <td>${l.source_url?`<a href="${l.source_url}" target="_blank">source</a>`:""}</td>
              <td class="px-3 py-2 flex gap-2">
                <button data-id="${l.id}" class="editBtn px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">Edit</button>
                <button data-id="${l.id}" class="deleteBtn px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Delete</button>
              </td>
            `,r.appendChild(w),w.querySelector(".editBtn").addEventListener("click",()=>{if(!v||!e||!b||!y)return;v.textContent="Edit Video",e.innerHTML=`
                <div class="space-y-3">
                  <label class="block text-sm font-medium">Title</label>
                  <input id="edit_title" value="${l.title||""}" class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
                  <label class="block text-sm font-medium">Artist</label>
                  <input id="edit_artist" value="${l.artist||""}" class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
                  <label class="block text-sm font-medium">Year</label>
                  <input id="edit_year" value="${l.year||""}" class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
                  <label class="block text-sm font-medium">Genre</label>
                  <input id="edit_genre" value="${l.genre||""}" class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />
                  <label class="flex items-center gap-2 mt-2">
                    <input id="edit_ident" type="checkbox" ${l.is_ident?"checked":""}> Ident
                  </label>
                  <button id="modalGrab" class="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm">Grab Metadata</button>
                </div>
              `,b.onclick=async()=>{await fetch(`/api/videos/${l.id}/edit`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:document.getElementById("edit_title").value,artist:document.getElementById("edit_artist").value,year:document.getElementById("edit_year").value,genre:document.getElementById("edit_genre").value,is_ident:document.getElementById("edit_ident").checked})}),g(),E(o)};let T=document.getElementById("modalGrab");T&&(T.onclick=async()=>{let S=new URLSearchParams;S.append("artist",document.getElementById("edit_artist").value),S.append("track",document.getElementById("edit_title").value);let C=await(await fetch("/api/grab",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:S})).json();C.year!==void 0&&(document.getElementById("edit_year").value=C.year),C.genre!==void 0&&(document.getElementById("edit_genre").value=C.genre)}),y.classList.remove("hidden")}),w.querySelector(".deleteBtn").addEventListener("click",()=>{!v||!e||!b||!y||(v.textContent="Delete Video",e.innerHTML=`
                <p class="text-red-400">Are you sure you want to delete:<br>
                <strong>${l.title||"(no title)"}</strong>?</p>
              `,b.onclick=async()=>{await fetch(`/api/videos/${l.id}`,{method:"DELETE"}),g(),E(o)},y.classList.remove("hidden"))})}),r.querySelectorAll("input[type=checkbox]").forEach(l=>{l.addEventListener("change",async()=>{let w=l.dataset.id;await fetch(`/api/videos/${w}/ident`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({is_ident:l.checked})})})}),h(I,o,n)})}function h(t,f,x){if(!a||!i||!s)return;let B=t===0?0:(f-1)*c+1,I=Math.min(f*c,t);a.textContent=`Showing ${B}\u2013${I} of ${t}`,i.disabled=f<=1,s.disabled=f>=x}function g(){y?.classList.add("hidden")}return{reloadVideos:()=>E(o)}}function M(r=()=>{}){let o=document.getElementById("addForm"),c=document.getElementById("addStatusText"),n=document.getElementById("addStatusBar"),d=document.getElementById("addStatusLog"),u=document.getElementById("addStatusToggleLog"),a=document.getElementById("addStatusModal"),i=document.getElementById("addStatusClose"),s=document.getElementById("addMeta"),p=document.getElementById("addMetaThumb"),m=document.getElementById("addMetaArtist"),y=document.getElementById("addMetaTrack");if(!o||!c||!n||!d||!a)return;function L(){typeof a.showModal=="function"?a.showModal():(a.style.display="block",a.classList.remove("hidden"))}function v(){typeof a.close=="function"?a.close():(a.style.display="none",a.classList.add("hidden"))}u?.addEventListener("click",()=>{let e=!d.classList.contains("hidden");d.classList.toggle("hidden",e),u.textContent=e?"Show log":"Hide log"}),i&&(i.disabled=!0,i.addEventListener("click",()=>{let e=document.getElementById("url");e&&(e.value=""),v(),r()})),o.addEventListener("submit",async e=>{e.preventDefault();let b=Object.fromEntries(new FormData(o).entries());c.textContent="Starting yt-dlp import\u2026",n.style.width="0%",d.textContent="",d.classList.add("hidden"),u&&(u.textContent="Show log"),s?.classList.add("hidden"),p&&(p.src=""),m&&(m.textContent=""),y&&(y.textContent=""),L();let E=b.url,h=new EventSource(`/api/add-url/stream?url=${encodeURIComponent(E)}`);h.addEventListener("status",g=>{let t=JSON.parse(g.data);c.textContent=t.message}),h.addEventListener("progress",g=>{let t=JSON.parse(g.data);typeof t.percent=="number"&&(n.style.width=`${t.percent}%`,c.textContent=`Downloading\u2026 ${t.percent.toFixed(1)}%`),t.speed&&(c.textContent+=` (${t.speed})`)}),h.addEventListener("log",g=>{let t=JSON.parse(g.data).line;d.textContent+=t+`
`,d.scrollTop=d.scrollHeight;let f=t.match(/\[download\]\s+([\d.]+)%.*?at\s+([^\s]+).*?ETA\s+([0-9:]+)/i);if(f){let x=parseFloat(f[1]),B=f[2],I=f[3];Number.isNaN(x)||(n.style.width=`${x}%`,c.textContent=`Downloading\u2026 ${x.toFixed(1)}% (${B}, ETA ${I})`)}}),h.addEventListener("video",g=>{let t=JSON.parse(g.data);c.textContent=`Added: ${t.artist||""} ${t.title||""}`}),h.addEventListener("meta",g=>{let t=JSON.parse(g.data);t.thumbnail&&p&&(p.src=t.thumbnail),(t.artist||t.uploader)&&(m.textContent=t.artist||t.uploader),(t.track||t.title)&&(y.textContent=t.track||t.title),s?.classList.remove("hidden")}),h.addEventListener("done",()=>{c.textContent="Import complete \u{1F389}",n.style.width="100%",h.close(),o.reset(),i&&(i.disabled=!1),r()}),h.addEventListener("error",g=>{try{let t=JSON.parse(g.data);c.textContent="Error: "+t.message}catch{c.textContent="Import failed"}h.close(),i&&(i.disabled=!1)})})}function O(){let r=document.querySelector("#videosTable tbody"),o=document.getElementById("modalOverlay"),c=document.getElementById("modalTitle"),n=document.getElementById("modalContent"),d=document.getElementById("modalConfirm"),u=document.getElementById("modalCancel");if(!r||!o||!c||!n||!d)return;async function a(){let p=await(await fetch("/api/videos")).json();r.innerHTML="",p.forEach(m=>{let y=document.createElement("tr");y.innerHTML=`
          <td>${m.id}</td>
          <td>${m.username||"(no title)"}</td>
          <td class="px-3 py-2 flex gap-2">
            <button data-id="${m.id}" class="editBtn px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">Edit</button>
            <button data-id="${m.id}" class="deleteBtn px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Delete</button>
          </td>
        `,r.appendChild(y),y.querySelector(".editBtn").addEventListener("click",()=>{c.textContent="Edit Video",n.innerHTML=`
            <div class="space-y-3">
              <label class="block text-sm font-medium">Title</label>
              <input id="edit_title" value="${m.title||""}"
                class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />

              <label class="block text-sm font-medium">Artist</label>
              <input id="edit_artist" value="${m.artist||""}"
                class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded" />

              <button id="modalGrab" class="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm">Grab Metadata</button>
            </div>
          `,d.onclick=async()=>{await fetch(`/api/videos/${m.id}/edit`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:document.getElementById("edit_title").value,artist:document.getElementById("edit_artist").value,year:document.getElementById("edit_year")?.value,genre:document.getElementById("edit_genre")?.value,is_ident:document.getElementById("edit_ident")?.checked})}),i(),a()},o.classList.remove("hidden")}),y.querySelector(".deleteBtn").addEventListener("click",()=>{c.textContent="Delete Video",n.innerHTML=`
            <p class="text-red-400">Are you sure you want to delete:<br>
            <strong>${m.title||"(no title)"}</strong>?</p>
          `,d.onclick=async()=>{await fetch(`/api/videos/${m.id}`,{method:"DELETE"}),i(),a()},o.classList.remove("hidden")})})}function i(){o.classList.add("hidden")}u?.addEventListener("click",i),a()}function P(){let r=document.getElementById("playlist"),o=document.getElementById("save"),n=document.getElementById("playlistId")?.dataset?.playlistId||window.playlistId;if(!r||!o||!n)return;async function d(){let a=await(await fetch(`/api/playlists/${n}/items`)).json();r.innerHTML="",a.forEach(i=>{let s=document.createElement("li");s.textContent=`${i.artist||""} - ${i.title||""} [${i.genre||""}]`,s.draggable=!0,s.dataset.id=i.id,r.appendChild(s)})}window.Sortable&&new Sortable(r,{animation:150,ghostClass:"opacity-50"}),o.addEventListener("click",async()=>{let u=[...r.querySelectorAll("li")].map(a=>Number(a.dataset.id));await fetch(`/api/playlists/${n}/order`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:u})}),alert("Order saved")}),d()}})();})();
