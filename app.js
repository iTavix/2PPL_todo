document.addEventListener("DOMContentLoaded", () => {
  const sb = window.sb; 

  const state = {
    currentDate: new Date(),
    selectedDate: new Date(),
    todos: [], monthCounts: {}, teamMembers: [], memberCounts: {}, selectedTodoId: null, user: null, currentMember: null, viewMode: 'personal', dragSrcEl: null, unreadTodoIds: new Set() 
  };

  const REFS = {
    landingPage: document.getElementById("landing-page"), 
    appLayout: document.getElementById("app-layout"), 
    landingForm: document.getElementById("landing-auth-form"), 
    landingEmail: document.getElementById("landing-email"), 
    landingPass: document.getElementById("landing-password"), 
    landingSwitchBtn: document.getElementById("auth-switch-btn"), 
    authTitle: document.getElementById("auth-title"), 
    authSubtitle: document.getElementById("auth-subtitle"), 
    landingSubmitBtn: document.getElementById("landing-submit-btn"),
    headerLogoutBtn: document.getElementById("header-logout-btn"), 
    headerGuideBtn: document.getElementById("header-guide-btn"), 
    guideBackdrop: document.getElementById("guide-backdrop"), 
    guideCloseBtn: document.getElementById("guide-close-btn"),
    monthLabel: document.getElementById("month-label"), 
    calendarDays: document.getElementById("calendar-days"), 
    selectedDateLabel: document.getElementById("selected-date-label"), 
    listsContainer: document.getElementById("lists-container"), 
    todoEmpty: document.getElementById("todo-empty"), 
    btnViewPersonal: document.getElementById("view-personal"), 
    btnViewTeam: document.getElementById("view-team"), 
    toastContainer: document.getElementById("toast-container"), 
    sidebar: document.getElementById("sidebar"), 
    sidebarBackdrop: document.getElementById("sidebar-overlay"), 
    mobileMenuBtn: document.getElementById("mobile-menu-btn"), 
    teamListContainer: document.getElementById("team-list-container"),
    counts: { total: document.getElementById("todo-count-total"), done: document.getElementById("todo-count-done"), open: document.getElementById("todo-count-open") },
    detail: { backdrop: document.getElementById("detail-backdrop"), title: document.getElementById("detail-title"), meta: document.getElementById("detail-meta"), notes: document.getElementById("detail-notes"), parts: document.getElementById("detail-participants"), btnClose: document.getElementById("detail-close"), btnEdit: document.getElementById("detail-edit-btn") },
    modal: { backdrop: document.getElementById("modal-backdrop"), form: document.getElementById("todo-form"), title: document.getElementById("todo-modal-title"), inputTitle: document.getElementById("todo-title"), inputNotes: document.getElementById("todo-notes"), inputDate: document.getElementById("todo-date"), inputPriority: document.getElementById("todo-priority"), inputCategory: document.getElementById("todo-category"), inputShared: document.getElementById("todo-shared"), partsContainer: document.getElementById("participants-container"), btnCancel: document.getElementById("modal-cancel"), btnSave: document.getElementById("modal-save") },
    user: { addBtn: document.getElementById("add-user-btn"), backdrop: document.getElementById("user-modal-backdrop"), form: document.getElementById("user-form"), inputName: document.getElementById("user-name-input"), btnCancel: document.getElementById("user-modal-cancel") }, 
    mainAddBtn: document.getElementById("add-todo-btn"), 
    prevMonth: document.getElementById("prev-month"), 
    nextMonth: document.getElementById("next-month")
  };

  const itLocale = "it-IT";
  const toISO = d => { const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`; };
  const fromISO = str => { if (!str) return new Date(); const [y, m, d] = str.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0); };
  const clean = (str) => str ? String(str).trim().toLowerCase() : "";
  const getCategoryClass = (cat) => { if(!cat) return ''; return 'cat-' + cat.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''); };

  function toggleSidebar() { REFS.sidebar.classList.toggle('active'); REFS.sidebarBackdrop.classList.toggle('active'); }
  REFS.mobileMenuBtn.onclick = toggleSidebar; REFS.sidebarBackdrop.onclick = toggleSidebar;
  REFS.headerGuideBtn.onclick = () => { REFS.guideBackdrop.style.display = "flex"; };
  REFS.guideCloseBtn.onclick = () => { REFS.guideBackdrop.style.display = "none"; };

  function loadUnreadFromStorage() { const stored = localStorage.getItem('unread_todos'); if(stored) { state.unreadTodoIds = new Set(JSON.parse(stored)); } }
  function markAsUnread(todoId) { state.unreadTodoIds.add(todoId); localStorage.setItem('unread_todos', JSON.stringify([...state.unreadTodoIds])); renderList(); }
  function markAsRead(todoId) { if(state.unreadTodoIds.has(todoId)) { state.unreadTodoIds.delete(todoId); localStorage.setItem('unread_todos', JSON.stringify([...state.unreadTodoIds])); renderList(); } }
  function showToast(message) { const toast = document.createElement("div"); toast.className = "toast"; toast.textContent = message; REFS.toastContainer.appendChild(toast); setTimeout(() => { toast.style.animation = "fadeOut 0.5s forwards"; setTimeout(() => toast.remove(), 500); }, 4000); }

  function initRealtime() {
    sb.channel('public:todos').on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, payload => {
          loadMonthIndicators(); loadCounts(); 
          const record = payload.new || payload.old;
          if (!record) return;
          if (state.currentMember && record.participants) {
             const amIInvolved = record.participants.some(p => clean(p.name) === clean(state.currentMember.name));
             if (amIInvolved && (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE')) {
                 if (state.selectedTodoId !== record.id) { markAsUnread(record.id); showToast(payload.eventType === 'INSERT' ? `🆕 Nuovo: ${record.title}` : `🔄 Aggiornato: ${record.title}`); }
             }
          }
          if (record.date === toISO(state.selectedDate)) { loadTodos().then(() => renderList()); }
      }).subscribe();
  }

  async function loadCurrentProfile() { 
    if (!state.user) return; 
    const { data } = await sb.from("team_members").select("*").eq("user_id", state.user.id).single(); 
    state.currentMember = data || { name: state.user.email }; 
  }

  async function loadMonthIndicators() {
    if(!state.user) return;
    const y=state.currentDate.getFullYear(), m=state.currentDate.getMonth();
    const start = toISO(new Date(y, m, -6, 12, 0, 0));
    const end = toISO(new Date(y, m+1, 14, 12, 0, 0));
    const {data} = await sb.from("todos").select("date, participants").gte("date", start).lte("date", end);
    const c = {};
    (data||[]).forEach(r => {
      const myName = state.currentMember ? clean(state.currentMember.name) : clean(state.user.email);
      const isInvolved = r.participants && r.participants.some(p => clean(p.name) === myName);
      if (isInvolved) { c[r.date] = (c[r.date]||0)+1; }
    });
    state.monthCounts = c; renderCalendar();
  }

  async function reloadAll() { await loadCurrentProfile(); await Promise.all([loadMonthIndicators(), loadTodos(), loadTeam(), loadCounts()]); renderCalendar(); renderList(); renderTeamManagement(); }
  
  async function addTeamMember(name) { if(!state.user) return; await sb.from("team_members").insert({ name: name }); await reloadAll(); }
  async function deleteTeamMember(id) { if(!state.user) return; if(confirm("Rimuovere membro?")) { await sb.from("team_members").delete().eq("id", id); reloadAll(); } }
  async function loadTeam() { if(!state.user) return; const {data} = await sb.from("team_members").select("*").order("created_at"); state.teamMembers = data || []; }
  async function loadCounts() { if(!state.user) return; const {data} = await sb.from("todos").select("participants").eq("done", false); const c = {}; (data||[]).forEach(r => { if(Array.isArray(r.participants)) { r.participants.forEach(p => { if(!p.done) c[p.name]=(c[p.name]||0)+1; }); } }); state.memberCounts = c; renderTeamManagement(); }
  async function loadTodos() { if(!state.user) return; const {data} = await sb.from("todos").select("*").eq("date", toISO(state.selectedDate)).order("position", {ascending: true}); state.todos = (data||[]).map(t => ({...t, participants: Array.isArray(t.participants)?t.participants:[]})); }

  function renderCalendar() {
    const y=state.currentDate.getFullYear(), m=state.currentDate.getMonth(); REFS.monthLabel.textContent = state.currentDate.toLocaleDateString(itLocale, {month:'long', year:'numeric'});
    const firstDay = new Date(y, m, 1).getDay(); const offset = (firstDay + 6) % 7; const daysInM = new Date(y, m+1, 0).getDate();
    REFS.calendarDays.innerHTML = "";
    for(let i=0; i<offset; i++) REFS.calendarDays.appendChild(Object.assign(document.createElement("div"), {className:"day-cell day-outside"}));
    for(let i=1; i<=daysInM; i++) {
      const d = new Date(y, m, i, 12, 0, 0); const cell = document.createElement("div"); cell.className = "day-cell";
      if(toISO(d) === toISO(new Date())) cell.innerHTML += `<span class="day-today">${i}</span>`; else cell.innerHTML = `<span>${i}</span>`;
      if(toISO(d) === toISO(state.selectedDate)) cell.classList.add("day-selected");
      if(state.monthCounts[toISO(d)]) { const dots = document.createElement("div"); dots.className="day-dots"; for(let k=0; k<Math.min(state.monthCounts[toISO(d)],3); k++) dots.appendChild(Object.assign(document.createElement("div"),{className:"day-dot"})); cell.appendChild(dots); }
      cell.onclick = () => { state.selectedDate = d; renderCalendar(); loadTodos().then(() => renderList()); };
      REFS.calendarDays.appendChild(cell);
    }
  }

  function renderTeamManagement() {
      REFS.teamListContainer.innerHTML = "";
      state.teamMembers.forEach(member => {
          const row = document.createElement("div"); row.className = "team-member-row";
          const count = state.memberCounts[member.name] || 0;
          row.innerHTML = `<div class="team-member-info"><div class="member-avatar">${member.name.charAt(0)}</div><span>${member.name}</span></div><div class="member-stats">${count > 0 ? `<span class="member-count-badge">${count}</span>` : ''}</div>`;
          const delBtn = document.createElement("button"); delBtn.className = "delete-member-btn"; delBtn.innerHTML = "×"; delBtn.onclick = () => deleteTeamMember(member.id);
          row.querySelector(".member-stats").appendChild(delBtn); REFS.teamListContainer.appendChild(row);
      });
  }

  function renderList() {
    REFS.listsContainer.innerHTML = ""; REFS.selectedDateLabel.textContent = state.selectedDate.toLocaleDateString(itLocale, {weekday:'long', day:'numeric', month:'long'});
    if(state.todos.length === 0) { REFS.todoEmpty.style.display = "block"; return; } REFS.todoEmpty.style.display = "none";
    const members = state.viewMode === 'personal' ? (state.currentMember ? [state.currentMember] : []) : state.teamMembers;
    members.forEach(member => {
      const memberTodos = state.todos.filter(t => t.participants.some(p => clean(p.name) === clean(member.name)));
      if(memberTodos.length > 0) {
        const section = document.createElement("div"); section.className = "user-todo-section";
        const hasUnread = memberTodos.some(t => state.unreadTodoIds.has(t.id));
        section.innerHTML = `<div class="user-section-title" style="${clean(member.name) === clean(state.currentMember?.name) ? 'color:var(--ios-blue);' : ''}">${member.name}${hasUnread ? '<span class="notification-dot"></span>' : ''}</div>`;
        const ul = document.createElement("ul"); ul.className = "apple-list";
        memberTodos.forEach(t => {
          const li = document.createElement("li"); li.className = "todo-item";
          const unread = state.unreadTodoIds.has(t.id) ? 'font-weight:700;' : '';
          li.innerHTML = `<div class="check-circle ${t.done?'checked':''}"></div><div class="todo-content"><div class="todo-head-row">${t.category ? `<span class="category-pill ${getCategoryClass(t.category)}">${t.category}</span>` : ''}<div class="todo-title ${t.done?'done':''}" style="${unread}">${t.title}</div></div></div>`;
          li.onclick = () => { markAsRead(t.id); state.selectedTodoId = t.id; renderDetail(); };
          li.querySelector(".check-circle").onclick = (e) => { e.stopPropagation(); toggleStatus(t); };
          ul.appendChild(li);
        });
        section.appendChild(ul); REFS.listsContainer.appendChild(section);
      }
    });
  }

  // Eventi UI
  REFS.headerLogoutBtn.onclick = () => sb.auth.signOut().then(() => location.reload());
  REFS.prevMonth.onclick = () => { state.currentDate.setMonth(state.currentDate.getMonth()-1); reloadAll(); };
  REFS.nextMonth.onclick = () => { state.currentDate.setMonth(state.currentDate.getMonth()+1); reloadAll(); };
  REFS.mainAddBtn.onclick = () => openModal(null);
  REFS.user.addBtn.onclick = () => { REFS.user.backdrop.style.display = "flex"; };
  REFS.user.btnCancel.onclick = () => { REFS.user.backdrop.style.display = "none"; };
  REFS.user.form.onsubmit = (e) => { e.preventDefault(); addTeamMember(REFS.user.inputName.value); REFS.user.backdrop.style.display = "none"; REFS.user.form.reset(); };

  REFS.landingForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = REFS.landingEmail.value;
    const password = REFS.landingPass.value; // Risolto: Corrisponde all'ID HTML landing-password
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (data.user) { state.user = data.user; REFS.landingPage.style.display = 'none'; REFS.appLayout.style.display = 'block'; reloadAll(); initRealtime(); }
    else if(error) alert(error.message);
  };

  (async () => {
    const { data } = await sb.auth.getUser();
    if (data?.user) { state.user = data.user; REFS.landingPage.style.display = 'none'; REFS.appLayout.style.display = 'block'; loadUnreadFromStorage(); await reloadAll(); initRealtime(); }
  })();
});