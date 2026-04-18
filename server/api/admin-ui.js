function registerAdminUiRoutes(app, deps) {
  const { requireSession, adminGetRow } = deps;

  app.get("/admin", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const adminUser = adminGetRow(
      "SELECT id, username, is_admin FROM users WHERE id = ?",
      [Number(session.id)],
    );

    if (!adminUser || Number(adminUser.is_admin || 0) !== 1) {
      return res.status(403).send("Admin access required.");
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Songbird Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --bg: #0b1020;
      --panel: #121936;
      --panel-2: #182247;
      --text: #eef2ff;
      --muted: #a5b4fc;
      --accent: #60a5fa;
      --danger: #f87171;
      --ok: #34d399;
      --border: #2a376b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, Arial, sans-serif;
      background: linear-gradient(180deg, #0b1020, #0f1730);
      color: var(--text);
    }
    .wrap {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .title {
      font-size: 28px;
      font-weight: 800;
    }
    .muted {
      color: var(--muted);
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 16px;
    }
    .card {
      grid-column: span 12;
      background: rgba(18, 25, 54, 0.92);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    }
    .card.half { grid-column: span 6; }
    .card.third { grid-column: span 4; }
    @media (max-width: 900px) {
      .card.half, .card.third { grid-column: span 12; }
    }
    h2 {
      margin: 0 0 12px 0;
      font-size: 18px;
    }
    input, select, textarea, button {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--panel-2);
      color: var(--text);
      padding: 12px 14px;
      font-size: 14px;
    }
    textarea {
      min-height: 110px;
      resize: vertical;
    }
    button {
      cursor: pointer;
      background: var(--accent);
      color: #081226;
      font-weight: 700;
      border: none;
    }
    button.secondary {
      background: #27345f;
      color: var(--text);
      border: 1px solid var(--border);
    }
    button.danger {
      background: var(--danger);
      color: white;
    }
    .row {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 12px;
      margin-bottom: 12px;
    }
    .col-4 { grid-column: span 4; }
    .col-6 { grid-column: span 6; }
    .col-8 { grid-column: span 8; }
    .col-12 { grid-column: span 12; }
    @media (max-width: 900px) {
      .col-4, .col-6, .col-8, .col-12 { grid-column: span 12; }
    }
    pre {
      background: #0a1022;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      min-height: 180px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    @media (max-width: 900px) {
      .stats { grid-template-columns: repeat(2, 1fr); }
    }
    .stat {
      background: #0e1632;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
    }
    .stat .label {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
    }
    .stat .value {
      font-size: 24px;
      font-weight: 800;
    }
    .status {
      margin-top: 10px;
      font-size: 14px;
      color: var(--muted);
    }
    .ok { color: var(--ok); }
    .danger-text { color: #fca5a5; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <div>
        <div class="title">Songbird Admin Panel</div>
        <div class="muted">Logged in as admin: ${String(adminUser.username || "")}</div>
      </div>
      <div style="min-width:220px">
        <button class="secondary" onclick="loadInspect()">Refresh Overview</button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Overview</h2>
        <div class="stats">
          <div class="stat"><div class="label">Users</div><div class="value" id="usersCount">-</div></div>
          <div class="stat"><div class="label">Chats</div><div class="value" id="chatsCount">-</div></div>
          <div class="stat"><div class="label">Messages</div><div class="value" id="messagesCount">-</div></div>
          <div class="stat"><div class="label">Files</div><div class="value" id="filesCount">-</div></div>
        </div>
        <div class="status" id="overviewStatus">Loading...</div>
      </div>

      <div class="card half">
        <h2>Create User</h2>
        <div class="row">
          <div class="col-6"><input id="createUsername" placeholder="username" /></div>
          <div class="col-6"><input id="createNickname" placeholder="nickname" /></div>
          <div class="col-12"><input id="createPassword" type="password" placeholder="password" /></div>
          <div class="col-12"><button onclick="createUser()">Create User</button></div>
        </div>
      </div>

      <div class="card half">
        <h2>Generate Users</h2>
        <div class="row">
          <div class="col-4"><input id="genCount" type="number" value="5" min="1" max="5000" placeholder="count" /></div>
          <div class="col-4"><input id="genUserPrefix" value="user" placeholder="username prefix" /></div>
          <div class="col-4"><input id="genNickPrefix" value="User" placeholder="nickname prefix" /></div>
          <div class="col-12"><input id="genPassword" type="password" placeholder="password for all users" /></div>
          <div class="col-12"><button onclick="generateUsers()">Generate Users</button></div>
        </div>
      </div>

      <div class="card half">
        <h2>Delete Users</h2>
        <div class="row">
          <div class="col-12">
            <textarea id="deleteUsersInput" placeholder="One username or id per line. Leave empty to delete all users."></textarea>
          </div>
          <div class="col-12">
            <button class="danger" onclick="deleteUsers()">Delete Selected Users</button>
          </div>
        </div>
      </div>

      <div class="card half">
        <h2>Delete Chats</h2>
        <div class="row">
          <div class="col-12">
            <textarea id="deleteChatsInput" placeholder="One chat id per line. Leave empty to delete all chats."></textarea>
          </div>
          <div class="col-12">
            <button class="danger" onclick="deleteChats()">Delete Selected Chats</button>
          </div>
        </div>
      </div>

      <div class="card half">
        <h2>Create Demo</h2>
        <div class="row">
          <div class="col-4"><input id="demoCount" type="number" value="15" /></div>
          <div class="col-4"><input id="demoDays" type="number" value="5" /></div>
          <div class="col-4">
            <select id="demoRecreate">
              <option value="false">No recreate</option>
              <option value="true">Allow recreate</option>
            </select>
          </div>
          <div class="col-12"><button onclick="createDemo()">Create Demo Data</button></div>
        </div>
      </div>

      <div class="card half">
        <h2>Generate Chat Messages</h2>
        <div class="row">
          <div class="col-4"><input id="msgChatId" type="number" placeholder="chat id" /></div>
          <div class="col-4"><input id="msgUserA" placeholder="user A" /></div>
          <div class="col-4"><input id="msgUserB" placeholder="user B" /></div>
          <div class="col-6"><input id="msgCount" type="number" value="20" /></div>
          <div class="col-6"><input id="msgDays" type="number" value="7" /></div>
          <div class="col-12"><button onclick="generateMessages()">Generate Messages</button></div>
        </div>
      </div>

      <div class="card">
        <h2>Danger Zone</h2>
        <div class="row">
          <div class="col-6"><button class="danger" onclick="deleteFiles()">Delete All Files</button></div>
          <div class="col-6"><button class="danger" onclick="resetDb()">Reset Database</button></div>
        </div>
      </div>

      <div class="card">
        <h2>Result</h2>
        <pre id="resultBox">Ready.</pre>
      </div>
    </div>
  </div>

  <script>
    async function api(action, payload = {}) {
      const res = await fetch("/api/admin/db-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, payload }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!res.ok) {
        throw new Error(data?.error || ("Request failed: " + res.status));
      }
      return data;
    }

    function show(data) {
      document.getElementById("resultBox").textContent = JSON.stringify(data, null, 2);
    }

    function lines(id) {
      return document.getElementById(id).value
        .split("\\n")
        .map(v => v.trim())
        .filter(Boolean);
    }

    async function loadInspect() {
      try {
        document.getElementById("overviewStatus").textContent = "Loading...";
        const data = await api("inspect_db", { kind: "all", limit: 10 });
        show(data);
        const counts = data?.result?.counts || {};
        document.getElementById("usersCount").textContent = counts.users ?? "-";
        document.getElementById("chatsCount").textContent = counts.chats ?? "-";
        document.getElementById("messagesCount").textContent = counts.messages ?? "-";
        document.getElementById("filesCount").textContent = counts.files ?? "-";
        document.getElementById("overviewStatus").textContent = "Overview loaded successfully.";
        document.getElementById("overviewStatus").className = "status ok";
      } catch (err) {
        document.getElementById("overviewStatus").textContent = err.message;
        document.getElementById("overviewStatus").className = "status danger-text";
        show({ error: err.message });
      }
    }

    async function createUser() {
      try {
        const payload = {
          username: document.getElementById("createUsername").value.trim(),
          nickname: document.getElementById("createNickname").value.trim(),
          password: document.getElementById("createPassword").value
        };
        const data = await api("create_user", payload);
        show(data);
        loadInspect();
      } catch (err) { show({ error: err.message }); }
    }

    async function generateUsers() {
      try {
        const payload = {
          count: Number(document.getElementById("genCount").value || 0),
          usernamePrefix: document.getElementById("genUserPrefix").value.trim(),
          nicknamePrefix: document.getElementById("genNickPrefix").value.trim(),
          password: document.getElementById("genPassword").value
        };
        const data = await api("generate_users", payload);
        show(data);
        loadInspect();
      } catch (err) { show({ error: err.message }); }
    }

    async function deleteUsers() {
      if (!confirm("Delete selected users?")) return;
      try {
        const data = await api("delete_users", { selectors: lines("deleteUsersInput") });
        show(data);
        loadInspect();
      } catch (err) { show({ error: err.message }); }
    }

    async function deleteChats() {
      if (!confirm("Delete selected chats?")) return;
      try {
        const chatIds = lines("deleteChatsInput").map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0);
        const data = await api("delete_chats", { chatIds });
        show(data);
        loadInspect();
      } catch (err) { show({ error: err.message }); }
    }

    async function createDemo() {
      try {
        const data = await api("create_demo", {
          count: Number(document.getElementById("demoCount").value || 15),
          daysBack: Number(document.getElementById("demoDays").value || 5),
          allowRecreate: document.getElementById("demoRecreate").value === "true"
        });
        show(data);
        loadInspect();
      } catch (err) { show({ error: err.message }); }
    }

    async function generateMessages() {
      try {
        const data = await api("generate_chat_messages", {
          chatId: Number(document.getElementById("msgChatId").value || 0),
          userA: document.getElementById("msgUserA").value.trim(),
          userB: document.getElementById("msgUserB").value.trim(),
          count: Number(document.getElementById("msgCount").value || 20),
          days: Number(document.getElementById("msgDays").value || 7)
        });
        show(data);
        loadInspect();
      } catch (err) { show({ error: err.message }); }
    }

    async function deleteFiles() {
      if (!confirm("Delete all message files and avatars?")) return;
      try {
        const data = await api("delete_files", { selectors: [] });
        show(data);
        loadInspect();
      } catch (err) { show({ error: err.message }); }
    }

    async function resetDb() {
      if (!confirm("Reset the entire database? This is destructive.")) return;
      try {
        const data = await api("reset_db", {});
        show(data);
        loadInspect();
      } catch (err) { show({ error: err.message }); }
    }

    loadInspect();
  </script>
</body>
</html>`);
  });
}

export { registerAdminUiRoutes };