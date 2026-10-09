(function () {
  "use strict";

  const config = window.HANSHIN_CONFIG || {};
  let client = null;
  let currentProfile = null;
  let currentRole = "member";
  let routeSequence = 0;

  const byId = (id) => document.getElementById(id);

  function isConfigured() {
    return Boolean(
      config.supabaseUrl &&
      config.supabasePublishableKey &&
      !config.supabaseUrl.startsWith("YOUR_") &&
      !config.supabasePublishableKey.startsWith("YOUR_")
    );
  }

  function setMessage(targetId, message, type = "info") {
    const target = byId(targetId);
    if (!target) return;
    target.textContent = message || "";
    target.className = `auth-message${message ? ` show ${type}` : ""}`;
  }

  function setFormBusy(form, busy) {
    form.querySelectorAll("input, button").forEach((element) => {
      element.disabled = busy;
    });
  }

  function switchAuthMode(mode) {
    const login = mode === "login";
    byId("loginForm").hidden = !login;
    byId("signupForm").hidden = login;
    byId("loginTab").classList.toggle("on", login);
    byId("signupTab").classList.toggle("on", !login);
    byId("loginTab").setAttribute("aria-selected", String(login));
    byId("signupTab").setAttribute("aria-selected", String(!login));
    setMessage("authMessage", "");
  }

  function showAuthForms() {
    byId("app").style.display = "none";
    byId("loginWrap").style.display = "flex";
    byId("authForms").hidden = false;
    byId("authStatus").hidden = true;
  }

  function showAccountStatus(status, email) {
    const content = {
      pending: {
        icon: "⏳",
        title: "관리자 승인 대기 중",
        text: `${email || "신청 계정"}의 이메일 인증이 완료되었습니다. 관리자가 가입 정보를 검토한 뒤 승인합니다.`
      },
      rejected: {
        icon: "⛔",
        title: "가입 신청이 반려되었습니다",
        text: "입력한 소속 정보가 정확한지 관리자에게 문의해 주세요."
      },
      suspended: {
        icon: "🔒",
        title: "이용이 정지된 계정입니다",
        text: "현재 이 계정으로는 재무정보에 접근할 수 없습니다. 관리자에게 문의해 주세요."
      },
      setup: {
        icon: "⚙️",
        title: "보안 시스템 설정이 필요합니다",
        text: "config.js에 Supabase URL과 publishable key를 입력한 뒤 다시 배포해 주세요."
      },
      data: {
        icon: "📦",
        title: "대시보드 데이터가 준비되지 않았습니다",
        text: "관리자가 비공개 시드 데이터를 Supabase에 등록해야 합니다."
      }
    }[status];

    byId("app").style.display = "none";
    byId("loginWrap").style.display = "flex";
    byId("authForms").hidden = true;
    byId("authStatus").hidden = false;
    byId("authStatusIcon").textContent = content.icon;
    byId("authStatusTitle").textContent = content.title;
    byId("authStatusText").textContent = content.text;
    byId("statusLogout").hidden = status === "setup";
  }

  function friendlyAuthError(error) {
    const message = String(error?.message || error || "");
    if (/Invalid login credentials/i.test(message)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (/Email not confirmed/i.test(message)) return "이메일 인증을 먼저 완료해 주세요.";
    if (/User already registered/i.test(message)) return "이미 가입된 이메일입니다.";
    if (/Password should be/i.test(message)) return "비밀번호 보안 조건을 확인해 주세요.";
    if (/rate limit/i.test(message)) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    return message || "요청을 처리하지 못했습니다.";
  }

  function emailDomainAllowed(email) {
    const allowed = Array.isArray(config.allowedEmailDomains)
      ? config.allowedEmailDomains.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
      : [];
    if (!allowed.length) return true;
    const domain = String(email).toLowerCase().split("@").pop();
    return allowed.includes(domain);
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormBusy(form, true);
    setMessage("authMessage", "로그인 정보를 확인하고 있습니다.", "info");

    const { error } = await client.auth.signInWithPassword({
      email: byId("loginEmail").value.trim(),
      password: byId("loginPassword").value
    });

    setFormBusy(form, false);
    if (error) setMessage("authMessage", friendlyAuthError(error), "error");
  }

  async function handleSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = byId("signupEmail").value.trim().toLowerCase();
    const password = byId("signupPassword").value;
    const confirmPassword = byId("signupPasswordConfirm").value;

    if (!emailDomainAllowed(email)) {
      setMessage("authMessage", "허용된 회사 이메일 도메인으로 신청해 주세요.", "error");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("authMessage", "비밀번호와 비밀번호 확인이 일치하지 않습니다.", "error");
      return;
    }

    setFormBusy(form, true);
    setMessage("authMessage", "가입 신청을 등록하고 있습니다.", "info");

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: byId("signupName").value.trim(),
          department: byId("signupDepartment").value.trim(),
          employee_no: byId("signupEmployeeNo").value.trim()
        },
        emailRedirectTo: config.siteUrl || window.location.href.split("#")[0]
      }
    });

    setFormBusy(form, false);
    if (error) {
      setMessage("authMessage", friendlyAuthError(error), "error");
      return;
    }

    form.reset();
    if (data.session) {
      setMessage("authMessage", "가입 신청이 완료되었습니다. 관리자 승인을 기다려 주세요.", "success");
    } else {
      setMessage("authMessage", "인증 이메일을 보냈습니다. 이메일 인증 후 관리자 승인을 기다려 주세요.", "success");
    }
  }

  async function loadProfile(userId) {
    const { data, error } = await client
      .from("profiles")
      .select("id,email,full_name,department,employee_no,status,requested_at,approved_at")
      .eq("id", userId)
      .single();
    if (error) throw error;
    return data;
  }

  async function loadRole(userId) {
    const { data, error } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();
    if (error) throw error;
    return data.role;
  }

  async function loadDashboardData() {
    const { data, error } = await client
      .from("dashboard_datasets")
      .select("payload,version,published_at")
      .eq("dataset_key", "main-dashboard")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  function setAdminVisibility(isAdmin) {
    document.querySelectorAll(".admin-only").forEach((element) => {
      element.hidden = !isAdmin;
    });
  }

  function configureExternalLinks() {
    document.querySelectorAll(".protected-link").forEach((element) => {
      const value = config.externalLinks?.[element.dataset.configLink];
      if (!value) return;
      try {
        const url = new URL(value);
        const unsafeParameter = [...url.searchParams.keys()].some((key) => /token|secret|password|api.?key/i.test(key));
        if (url.protocol !== "https:" || url.username || url.password || unsafeParameter) return;
        element.href = url.href;
        element.hidden = false;
      } catch {
        element.hidden = true;
      }
    });
  }

  async function routeSession(session) {
    const sequence = ++routeSequence;
    if (!session?.user) {
      currentProfile = null;
      currentRole = "member";
      setAdminVisibility(false);
      showAuthForms();
      return;
    }

    try {
      const profile = await loadProfile(session.user.id);
      if (sequence !== routeSequence) return;
      currentProfile = profile;

      if (profile.status !== "approved") {
        showAccountStatus(profile.status, profile.email);
        return;
      }

      currentRole = await loadRole(session.user.id);
      const dataset = await loadDashboardData();
      if (sequence !== routeSequence) return;
      if (!dataset?.payload) {
        showAccountStatus("data", profile.email);
        return;
      }

      window.applyDashboardData(dataset.payload);
      byId("sessionUser").textContent = profile.full_name || profile.email;
      setAdminVisibility(currentRole === "admin");
      configureExternalLinks();
      window.showDashboard();
      if (currentRole === "admin") await loadAdminUsers();
    } catch (error) {
      console.error(error);
      showAuthForms();
      setMessage("authMessage", "회원 권한 또는 대시보드 데이터를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[character]);
  }

  function statusLabel(status) {
    return {
      pending: "승인 대기",
      approved: "승인 완료",
      rejected: "반려",
      suspended: "이용 정지"
    }[status] || status;
  }

  function formatDate(value) {
    return value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
  }

  function actionButtons(user) {
    const id = escapeHtml(user.id);
    if (user.status === "pending") {
      return `<button class="admin-action approve" data-user-id="${id}" data-next-status="approved">승인</button><button class="admin-action reject" data-user-id="${id}" data-next-status="rejected">반려</button>`;
    }
    if (user.status === "approved") {
      return `<button class="admin-action reject" data-user-id="${id}" data-next-status="suspended">이용 정지</button>`;
    }
    return `<button class="admin-action approve" data-user-id="${id}" data-next-status="approved">다시 승인</button>`;
  }

  function renderAdminUsers(users) {
    const target = byId("adminUsers");
    if (!users.length) {
      target.innerHTML = '<div class="admin-empty">해당 상태의 회원이 없습니다.</div>';
      return;
    }
    target.innerHTML = users.map((user) => `
      <article class="admin-card">
        <div><div class="admin-name">${escapeHtml(user.full_name || "이름 미입력")}</div><div class="admin-meta">${escapeHtml(user.email)}<br>${escapeHtml(user.department || "부서 미입력")} · 사번 ${escapeHtml(user.employee_no || "-")}</div></div>
        <div><span class="status-chip ${escapeHtml(user.status)}">${escapeHtml(statusLabel(user.status))}</span><div class="admin-meta">신청 ${escapeHtml(formatDate(user.requested_at))}</div></div>
        <div class="admin-actions">${actionButtons(user)}</div>
      </article>`).join("");
  }

  async function loadAdminUsers() {
    if (currentRole !== "admin") return;
    const filter = byId("adminStatusFilter").value;
    byId("adminUsers").innerHTML = '<div class="admin-empty">회원 정보를 불러오는 중입니다.</div>';
    setMessage("adminMessage", "");

    let query = client
      .from("profiles")
      .select("id,email,full_name,department,employee_no,status,requested_at,approved_at")
      .order("requested_at", { ascending: true });
    if (filter !== "all") query = query.eq("status", filter);

    const { data, error } = await query;
    if (error) {
      setMessage("adminMessage", "회원 목록을 불러오지 못했습니다.", "error");
      byId("adminUsers").innerHTML = "";
      return;
    }
    renderAdminUsers(data || []);
  }

  async function updateUserStatus(userId, nextStatus) {
    const label = statusLabel(nextStatus);
    if (!window.confirm(`이 회원의 상태를 '${label}'(으)로 변경할까요?`)) return;
    let note = null;
    if (nextStatus === "rejected" || nextStatus === "suspended") {
      note = window.prompt("처리 사유를 입력하세요. 감사 이력에 기록됩니다.", "") || null;
    }

    setMessage("adminMessage", "회원 상태를 변경하고 있습니다.", "info");
    const { error } = await client.rpc("admin_set_user_status", {
      target_user_id: userId,
      new_status: nextStatus,
      note
    });
    if (error) {
      setMessage("adminMessage", friendlyAuthError(error), "error");
      return;
    }
    setMessage("adminMessage", `회원 상태를 '${label}'(으)로 변경했습니다.`, "success");
    await loadAdminUsers();
  }

  async function logout() {
    if (!client) return;
    await client.auth.signOut();
    byId("loginForm").reset();
    showAuthForms();
  }

  function bindEvents() {
    byId("loginTab").addEventListener("click", () => switchAuthMode("login"));
    byId("signupTab").addEventListener("click", () => switchAuthMode("signup"));
    byId("loginForm").addEventListener("submit", handleLogin);
    byId("signupForm").addEventListener("submit", handleSignup);
    byId("statusLogout").addEventListener("click", logout);
    byId("adminStatusFilter").addEventListener("change", loadAdminUsers);
    byId("adminRefresh").addEventListener("click", loadAdminUsers);
    byId("adminUsers").addEventListener("click", (event) => {
      const button = event.target.closest("[data-user-id][data-next-status]");
      if (button) updateUserStatus(button.dataset.userId, button.dataset.nextStatus);
    });
  }

  async function boot() {
    bindEvents();
    window.doLogout = logout;
    window.loadAdminUsers = loadAdminUsers;

    if (!isConfigured()) {
      showAccountStatus("setup");
      return;
    }
    if (!window.supabase?.createClient) {
      showAuthForms();
      setMessage("authMessage", "인증 모듈을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.", "error");
      return;
    }

    client = window.supabase.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => routeSession(session), 0);
    });

    const { data, error } = await client.auth.getSession();
    if (error) {
      showAuthForms();
      setMessage("authMessage", friendlyAuthError(error), "error");
      return;
    }
    await routeSession(data.session);
  }

  window.addEventListener("DOMContentLoaded", boot, { once: true });
})();

