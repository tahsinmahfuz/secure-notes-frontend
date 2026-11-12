const DEFAULT_API_BASE_URL = "https://secure-notes-api-1yud.onrender.com";
const STORAGE_TOKEN_KEY = "sn_jwt_token";
const STORAGE_API_KEY = "sn_api_base_url";

const savedApiBaseUrl = localStorage.getItem(STORAGE_API_KEY);

const state = {
  apiBaseUrl: (savedApiBaseUrl !== null ? savedApiBaseUrl : DEFAULT_API_BASE_URL).replace(/\/+$/, ""),
  token: localStorage.getItem(STORAGE_TOKEN_KEY) || "",
  user: null,
  notesPage: 1,
  notesTotalPages: 1,
  postsPage: 1,
  postsTotalPages: 1,
  interestsPage: 1,
  interestsTotalPages: 1,
  userPostsPage: 1,
  userPostsHasMore: false,
  adminUsersPage: 1,
  adminUsersTotalPages: 1,
  adminNotesPage: 1,
  adminNotesTotalPages: 1
};

const pageLimit = 5;

function $(id) {
  return document.getElementById(id);
}

function showStatus(message, isError = false) {
  const bar = $("status-bar");
  bar.textContent = message;
  bar.className = "status-bar " + (isError ? "error" : "ok");
  bar.hidden = false;
}

function clearStatus() {
  $("status-bar").hidden = true;
}

function parseInterests(raw) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (state.token) {
    headers["Authorization"] = "Bearer " + state.token;
  }

  const url = state.apiBaseUrl + path;
  const response = await fetch(url, { ...options, headers });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    if (data) {
      if (data.error) {
        errMsg = data.error;
      } else if (data.errors) {
        errMsg = Object.values(data.errors).flat().join(" ");
      } else if (data.title) {
        errMsg = data.title;
      }
    }
    throw new Error(errMsg);
  }

  return data;
}

function updateSessionUi() {
  const loggedIn = Boolean(state.user);
  $("auth-section").hidden = loggedIn;
  $("profile-section").hidden = !loggedIn;
  $("notes-section").hidden = !loggedIn;
  $("post-form").hidden = !loggedIn;
  $("interests-section").hidden = !loggedIn;
  $("logout-btn").hidden = !loggedIn;

  const isAdmin = loggedIn && state.user.role === "Admin";
  $("admin-section").hidden = !isAdmin;

  if (loggedIn) {
    $("session-info").textContent = `${state.user.name} (${state.user.email}) [${state.user.role}]`;
    $("profile-meta").textContent = `ID: ${state.user.id} | Role: ${state.user.role}`;
    $("profile-name").value = state.user.name;
    $("profile-interests").value = (state.user.interests || []).join(", ");
  } else {
    $("session-info").textContent = "Not signed in";
  }
}

async function bootstrapSession() {
  $("api-base-input").value = state.apiBaseUrl;
  await loadPosts();

  if (!state.token) {
    updateSessionUi();
    return;
  }

  try {
    state.user = await apiRequest("/api/users/me");
    updateSessionUi();
    await loadNotes();
    await loadInterestGroups();
    if (state.user.role === "Admin") {
      await loadAdminUsers();
      await loadAdminNotes();
    }
  } catch (err) {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    state.token = "";
    state.user = null;
    updateSessionUi();
    showStatus("Session expired: " + err.message, true);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearStatus();
  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("login-email").value,
        password: $("login-password").value
      })
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem(STORAGE_TOKEN_KEY, state.token);
    event.target.reset();
    updateSessionUi();
    showStatus("Signed in as " + data.user.email);
    await loadNotes();
    await loadPosts();
    await loadInterestGroups();
    if (data.user.role === "Admin") {
      await loadAdminUsers();
      await loadAdminNotes();
    }
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  clearStatus();
  try {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: $("reg-name").value,
        email: $("reg-email").value,
        password: $("reg-password").value,
        interests: parseInterests($("reg-interests").value)
      })
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem(STORAGE_TOKEN_KEY, state.token);
    event.target.reset();
    updateSessionUi();
    showStatus("Registered and signed in as " + data.user.email);
    await loadNotes();
    await loadPosts();
    await loadInterestGroups();
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function handleProfileUpdate(event) {
  event.preventDefault();
  clearStatus();
  try {
    const updated = await apiRequest("/api/users/me", {
      method: "PUT",
      body: JSON.stringify({
        name: $("profile-name").value,
        interests: parseInterests($("profile-interests").value)
      })
    });
    state.user = updated;
    updateSessionUi();
    showStatus("Profile updated.");
    await loadInterestGroups();
  } catch (err) {
    showStatus(err.message, true);
  }
}

function renderCard(title, metaText, bodyText, actionButtons) {
  const card = document.createElement("div");
  card.className = "card";

  const titleEl = document.createElement("div");
  titleEl.className = "card-title";
  titleEl.textContent = title;

  const metaEl = document.createElement("div");
  metaEl.className = "card-meta";
  metaEl.textContent = metaText;

  const bodyEl = document.createElement("div");
  bodyEl.className = "card-body";
  bodyEl.textContent = bodyText;

  card.appendChild(titleEl);
  card.appendChild(metaEl);
  card.appendChild(bodyEl);

  if (actionButtons.length > 0) {
    const actions = document.createElement("div");
    actions.className = "actions";
    actionButtons.forEach((btn) => actions.appendChild(btn));
    card.appendChild(actions);
  }

  return card;
}

function makeButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

async function loadNotes() {
  if (!state.token) return;
  try {
    const data = await apiRequest(`/api/notes?page=${state.notesPage}&limit=${pageLimit}`);
    state.notesTotalPages = Math.max(1, data.totalPages || 1);
    $("notes-page-num").textContent = String(data.page);
    $("notes-total-pages").textContent = String(state.notesTotalPages);
    $("notes-total-count").textContent = String(data.totalCount);
    $("notes-prev-btn").disabled = data.page <= 1;
    $("notes-next-btn").disabled = data.page >= state.notesTotalPages;

    const list = $("notes-list");
    list.innerHTML = "";
    if (data.items.length === 0) {
      list.textContent = "No notes found.";
      return;
    }

    data.items.forEach((note) => {
      const editBtn = makeButton("Edit", () => {
        $("note-id").value = note.id;
        $("note-title").value = note.title;
        $("note-content").value = note.content;
        $("note-submit-btn").textContent = "Update Note";
        $("note-cancel-btn").hidden = false;
      });
      const delBtn = makeButton("Delete", async () => {
        clearStatus();
        try {
          await apiRequest(`/api/notes/${note.id}`, { method: "DELETE" });
          showStatus("Note deleted.");
          await loadNotes();
        } catch (err) {
          showStatus(err.message, true);
        }
      });
      const meta = `ID: ${note.id} | Updated: ${new Date(note.updatedAt).toLocaleString()}`;
      list.appendChild(renderCard(note.title, meta, note.content, [editBtn, delBtn]));
    });
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function handleNoteSubmit(event) {
  event.preventDefault();
  clearStatus();
  const id = $("note-id").value;
  const payload = {
    title: $("note-title").value,
    content: $("note-content").value
  };

  try {
    if (id) {
      await apiRequest(`/api/notes/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      showStatus("Note updated.");
    } else {
      await apiRequest("/api/notes", { method: "POST", body: JSON.stringify(payload) });
      showStatus("Note created.");
    }
    resetNoteForm();
    await loadNotes();
  } catch (err) {
    showStatus(err.message, true);
  }
}

function resetNoteForm() {
  $("note-id").value = "";
  $("note-form").reset();
  $("note-submit-btn").textContent = "Create Note";
  $("note-cancel-btn").hidden = true;
}

async function handleLookupNote() {
  clearStatus();
  const id = $("note-lookup-id").value.trim();
  const box = $("note-lookup-result");
  if (!id) {
    box.hidden = true;
    return;
  }
  try {
    const note = await apiRequest(`/api/notes/${encodeURIComponent(id)}`);
    box.textContent = JSON.stringify(note, null, 2);
    box.hidden = false;
  } catch (err) {
    box.hidden = true;
    showStatus(err.message, true);
  }
}

async function loadPosts() {
  try {
    const data = await apiRequest(`/api/posts?page=${state.postsPage}&limit=${pageLimit}`);
    state.postsTotalPages = Math.max(1, data.totalPages || 1);
    $("posts-page-num").textContent = String(data.page);
    $("posts-total-pages").textContent = String(state.postsTotalPages);
    $("posts-total-count").textContent = String(data.totalCount);
    $("posts-prev-btn").disabled = data.page <= 1;
    $("posts-next-btn").disabled = data.page >= state.postsTotalPages;

    const list = $("posts-list");
    list.innerHTML = "";
    if (data.items.length === 0) {
      list.textContent = "No posts found.";
      return;
    }

    data.items.forEach((post) => {
      const buttons = [
        makeButton("Author Posts ($lookup)", async () => {
          $("lookup-user-id").value = post.userId;
          state.userPostsPage = 1;
          await loadUserPosts();
        })
      ];

      if (state.user && state.user.id === post.userId) {
        buttons.push(
          makeButton("Edit", () => {
            $("post-id").value = post.id;
            $("post-title").value = post.title;
            $("post-content").value = post.content;
            $("post-submit-btn").textContent = "Update Post";
            $("post-cancel-btn").hidden = false;
          }),
          makeButton("Delete", async () => {
            clearStatus();
            try {
              await apiRequest(`/api/posts/${post.id}`, { method: "DELETE" });
              showStatus("Post deleted.");
              await loadPosts();
            } catch (err) {
              showStatus(err.message, true);
            }
          })
        );
      }

      const meta = `ID: ${post.id} | Author: ${post.userId} | Created: ${new Date(post.createdAt).toLocaleString()}`;
      list.appendChild(renderCard(post.title, meta, post.content, buttons));
    });
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function handlePostSubmit(event) {
  event.preventDefault();
  clearStatus();
  const id = $("post-id").value;
  const payload = {
    title: $("post-title").value,
    content: $("post-content").value
  };

  try {
    if (id) {
      await apiRequest(`/api/posts/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      showStatus("Post updated.");
    } else {
      await apiRequest("/api/posts", { method: "POST", body: JSON.stringify(payload) });
      showStatus("Post created.");
    }
    resetPostForm();
    await loadPosts();
  } catch (err) {
    showStatus(err.message, true);
  }
}

function resetPostForm() {
  $("post-id").value = "";
  $("post-form").reset();
  $("post-submit-btn").textContent = "Create Post";
  $("post-cancel-btn").hidden = true;
}

async function loadInterestGroups() {
  if (!state.token) return;
  try {
    const data = await apiRequest(`/api/users/interests?page=${state.interestsPage}&limit=${pageLimit}`);
    state.interestsTotalPages = Math.max(1, data.totalPages || 1);
    $("interests-page-num").textContent = String(data.page);
    $("interests-total-pages").textContent = String(state.interestsTotalPages);
    $("interests-total-count").textContent = String(data.totalCount);
    $("interests-prev-btn").disabled = data.page <= 1;
    $("interests-next-btn").disabled = data.page >= state.interestsTotalPages;

    const list = $("interests-list");
    list.innerHTML = "";
    if (data.items.length === 0) {
      list.textContent = "No interest groups found.";
      return;
    }

    data.items.forEach((group) => {
      const members = group.users.map((u) => `${u.name} (${u.email}) [${u.id}]`).join("\n");
      const meta = `Users: ${group.userCount}`;
      list.appendChild(renderCard(group.interest, meta, members, []));
    });
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function loadUserPosts() {
  clearStatus();
  const userId = $("lookup-user-id").value.trim();
  if (!userId) {
    showStatus("Enter a User ID to look up posts.", true);
    return;
  }

  try {
    const data = await apiRequest(`/api/users/${encodeURIComponent(userId)}/posts?page=${state.userPostsPage}&limit=${pageLimit}`);
    state.userPostsHasMore = data.hasMorePosts;
    $("user-posts-header").textContent = `${data.name} (${data.email}) | Interests: ${(data.interests || []).join(", ") || "none"}`;
    $("user-posts-page-num").textContent = String(data.page);
    $("user-posts-pager").hidden = false;
    $("user-posts-prev-btn").disabled = data.page <= 1;
    $("user-posts-next-btn").disabled = !data.hasMorePosts;

    const list = $("user-posts-list");
    list.innerHTML = "";
    if (data.posts.length === 0) {
      list.textContent = "No posts for this user on this page.";
      return;
    }

    data.posts.forEach((post) => {
      const meta = `Post ID: ${post.id} | Created: ${new Date(post.createdAt).toLocaleString()}`;
      list.appendChild(renderCard(post.title, meta, post.content, []));
    });
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function loadAdminUsers() {
  if (!state.user || state.user.role !== "Admin") return;
  try {
    const data = await apiRequest(`/api/users?page=${state.adminUsersPage}&limit=${pageLimit}`);
    state.adminUsersTotalPages = Math.max(1, data.totalPages || 1);
    $("admin-users-page-num").textContent = String(data.page);
    $("admin-users-total-pages").textContent = String(state.adminUsersTotalPages);
    $("admin-users-total-count").textContent = String(data.totalCount);
    $("admin-users-prev-btn").disabled = data.page <= 1;
    $("admin-users-next-btn").disabled = data.page >= state.adminUsersTotalPages;

    const tbody = $("admin-users-tbody");
    tbody.innerHTML = "";
    data.items.forEach((user) => {
      const tr = document.createElement("tr");

      const idTd = document.createElement("td");
      idTd.className = "mono";
      idTd.textContent = user.id;

      const nameTd = document.createElement("td");
      nameTd.textContent = user.name;

      const emailTd = document.createElement("td");
      emailTd.textContent = user.email;

      const roleTd = document.createElement("td");
      roleTd.textContent = user.role;

      const intTd = document.createElement("td");
      intTd.textContent = (user.interests || []).join(", ");

      const actTd = document.createElement("td");
      const acts = document.createElement("div");
      acts.className = "actions";

      acts.appendChild(
        makeButton("Edit", () => {
          $("admin-user-id").value = user.id;
          $("admin-user-name").value = user.name;
          $("admin-user-email").value = user.email;
          $("admin-user-password").value = "";
          $("admin-user-role").value = user.role;
          $("admin-user-interests").value = (user.interests || []).join(", ");
          $("admin-user-submit-btn").textContent = "Update User";
          $("admin-user-cancel-btn").hidden = false;
        })
      );

      acts.appendChild(
        makeButton("Posts", async () => {
          $("lookup-user-id").value = user.id;
          state.userPostsPage = 1;
          await loadUserPosts();
        })
      );

      acts.appendChild(
        makeButton("Notes", async () => {
          $("admin-notes-userid").value = user.id;
          state.adminNotesPage = 1;
          await loadAdminNotes();
        })
      );

      if (user.id !== state.user.id) {
        acts.appendChild(
          makeButton("Delete", async () => {
            clearStatus();
            try {
              await apiRequest(`/api/users/${user.id}`, { method: "DELETE" });
              showStatus("User deleted.");
              await loadAdminUsers();
              await loadAdminNotes();
              await loadInterestGroups();
            } catch (err) {
              showStatus(err.message, true);
            }
          })
        );
      }

      actTd.appendChild(acts);
      tr.append(idTd, nameTd, emailTd, roleTd, intTd, actTd);
      tbody.appendChild(tr);
    });
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function handleAdminUserSubmit(event) {
  event.preventDefault();
  clearStatus();
  const id = $("admin-user-id").value;
  const password = $("admin-user-password").value;

  const payload = {
    name: $("admin-user-name").value,
    email: $("admin-user-email").value,
    role: $("admin-user-role").value,
    interests: parseInterests($("admin-user-interests").value)
  };
  if (password) {
    payload.password = password;
  }

  try {
    if (id) {
      await apiRequest(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      showStatus("User updated.");
    } else {
      if (!password) {
        showStatus("Password is required when creating a user.", true);
        return;
      }
      await apiRequest("/api/users", { method: "POST", body: JSON.stringify(payload) });
      showStatus("User created.");
    }
    resetAdminUserForm();
    await loadAdminUsers();
    await loadInterestGroups();
  } catch (err) {
    showStatus(err.message, true);
  }
}

function resetAdminUserForm() {
  $("admin-user-id").value = "";
  $("admin-user-form").reset();
  $("admin-user-submit-btn").textContent = "Create User";
  $("admin-user-cancel-btn").hidden = true;
}

async function loadAdminNotes() {
  if (!state.user || state.user.role !== "Admin") return;
  try {
    const userIdFilter = $("admin-notes-userid").value.trim();
    const query = userIdFilter
      ? `?userId=${encodeURIComponent(userIdFilter)}&page=${state.adminNotesPage}&limit=${pageLimit}`
      : `?page=${state.adminNotesPage}&limit=${pageLimit}`;

    const data = await apiRequest("/api/notes/all" + query);
    state.adminNotesTotalPages = Math.max(1, data.totalPages || 1);
    $("admin-notes-page-num").textContent = String(data.page);
    $("admin-notes-total-pages").textContent = String(state.adminNotesTotalPages);
    $("admin-notes-total-count").textContent = String(data.totalCount);
    $("admin-notes-prev-btn").disabled = data.page <= 1;
    $("admin-notes-next-btn").disabled = data.page >= state.adminNotesTotalPages;

    const list = $("admin-notes-list");
    list.innerHTML = "";
    if (data.items.length === 0) {
      list.textContent = "No notes found.";
      return;
    }

    data.items.forEach((note) => {
      const meta = `Note ID: ${note.id} | User ID: ${note.userId} | Updated: ${new Date(note.updatedAt).toLocaleString()}`;
      list.appendChild(renderCard(note.title, meta, note.content, []));
    });
  } catch (err) {
    showStatus(err.message, true);
  }
}

function bindEvents() {
  $("save-api-btn").addEventListener("click", async () => {
    state.apiBaseUrl = $("api-base-input").value.trim().replace(/\/+$/, "");
    localStorage.setItem(STORAGE_API_KEY, state.apiBaseUrl);
    showStatus("API URL saved.");
    await bootstrapSession();
  });

  $("logout-btn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    state.token = "";
    state.user = null;
    updateSessionUi();
    showStatus("Logged out.");
  });

  $("login-form").addEventListener("submit", handleLogin);
  $("register-form").addEventListener("submit", handleRegister);
  $("profile-form").addEventListener("submit", handleProfileUpdate);

  $("note-form").addEventListener("submit", handleNoteSubmit);
  $("note-cancel-btn").addEventListener("click", resetNoteForm);
  $("note-lookup-btn").addEventListener("click", handleLookupNote);
  $("notes-refresh-btn").addEventListener("click", loadNotes);
  $("notes-prev-btn").addEventListener("click", async () => {
    if (state.notesPage > 1) {
      state.notesPage--;
      await loadNotes();
    }
  });
  $("notes-next-btn").addEventListener("click", async () => {
    if (state.notesPage < state.notesTotalPages) {
      state.notesPage++;
      await loadNotes();
    }
  });

  $("post-form").addEventListener("submit", handlePostSubmit);
  $("post-cancel-btn").addEventListener("click", resetPostForm);
  $("posts-refresh-btn").addEventListener("click", loadPosts);
  $("posts-prev-btn").addEventListener("click", async () => {
    if (state.postsPage > 1) {
      state.postsPage--;
      await loadPosts();
    }
  });
  $("posts-next-btn").addEventListener("click", async () => {
    if (state.postsPage < state.postsTotalPages) {
      state.postsPage++;
      await loadPosts();
    }
  });

  $("interests-load-btn").addEventListener("click", loadInterestGroups);
  $("interests-prev-btn").addEventListener("click", async () => {
    if (state.interestsPage > 1) {
      state.interestsPage--;
      await loadInterestGroups();
    }
  });
  $("interests-next-btn").addEventListener("click", async () => {
    if (state.interestsPage < state.interestsTotalPages) {
      state.interestsPage++;
      await loadInterestGroups();
    }
  });

  $("lookup-posts-btn").addEventListener("click", async () => {
    state.userPostsPage = 1;
    await loadUserPosts();
  });
  $("user-posts-prev-btn").addEventListener("click", async () => {
    if (state.userPostsPage > 1) {
      state.userPostsPage--;
      await loadUserPosts();
    }
  });
  $("user-posts-next-btn").addEventListener("click", async () => {
    if (state.userPostsHasMore) {
      state.userPostsPage++;
      await loadUserPosts();
    }
  });

  $("admin-user-form").addEventListener("submit", handleAdminUserSubmit);
  $("admin-user-cancel-btn").addEventListener("click", resetAdminUserForm);
  $("admin-users-refresh-btn").addEventListener("click", loadAdminUsers);
  $("admin-users-prev-btn").addEventListener("click", async () => {
    if (state.adminUsersPage > 1) {
      state.adminUsersPage--;
      await loadAdminUsers();
    }
  });
  $("admin-users-next-btn").addEventListener("click", async () => {
    if (state.adminUsersPage < state.adminUsersTotalPages) {
      state.adminUsersPage++;
      await loadAdminUsers();
    }
  });

  $("admin-notes-refresh-btn").addEventListener("click", async () => {
    state.adminNotesPage = 1;
    await loadAdminNotes();
  });
  $("admin-notes-prev-btn").addEventListener("click", async () => {
    if (state.adminNotesPage > 1) {
      state.adminNotesPage--;
      await loadAdminNotes();
    }
  });
  $("admin-notes-next-btn").addEventListener("click", async () => {
    if (state.adminNotesPage < state.adminNotesTotalPages) {
      state.adminNotesPage++;
      await loadAdminNotes();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  bootstrapSession();
});

