document.addEventListener("DOMContentLoaded", () => {
  const sb = window.sb; 

  const state = {
    currentDate: new Date(),
    selectedDate: new Date(),
    todos: [], 
    monthCounts: {}, 
    teamMembers: [], 
    memberCounts: {}, 
    selectedTodoId: null, 
    user: null,         
    currentMember: null,
    viewMode: 'personal',
    dragSrcEl: null,
    unreadTodoIds: new Set() 
  };

  // --- REFS ---
  const REFS = {
    // LAYOUT CONTAINERS
    landingPage: document.getElementById("landing-page"),
    appLayout: document.getElementById("app-layout"),

    // LANDING AUTH FORM
    landingForm: document.getElementById("landing-auth-form"),
    landingEmail: document.getElementById("landing-email"),
    landingPass: document.getElementById("landing-password"),
    landingSwitchBtn: document.getElementById("auth-switch-btn"),
    authTitle: document.getElementById("auth-title"),
    authSubtitle: document.getElementById("auth-subtitle"),
    landingSubmitBtn: document.getElementById("landing-submit-btn"),
    
    // HEADER BUTTONS
    headerLogoutBtn: document.getElementById("header-logout-btn"),
    headerGuideBtn: document.getElementById("header-guide-btn"),

    // GUIDA MODAL
    guideBackdrop: document.getElementById("guide-backdrop"),
    guideCloseBtn: document.getElementById("guide-close-btn"),

    // APP REFS
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
    
    counts: {
      total: document.getElementById("todo-count-total"),
      done: document.getElementById("todo-count-done"),
      open: document.getElementById("todo-count-open")
    },
    detail: {
      backdrop: document.getElementById("detail-backdrop"),
      title: document.getElementById("detail-title"),
      meta: document.getElementById("detail-meta"),
      notes: document.getElementById("detail-notes"),
      parts: document.getElementById("detail-participants"),
      btnClose: document.getElementById("detail-close"),
      btnEdit: document.getElementById("detail-edit-btn")
    },
    modal: {
      backdrop: document.getElementById("modal-backdrop"),
      form: document.getElementById("todo-form"),
      title: document.getElementById("todo-modal-title"),
      inputTitle: document.getElementById("todo-title"),
      inputNotes: document.getElementById("todo-notes"),
      inputDate: document.getElementById("todo-date"),
      inputPriority: document.getElementById("todo-priority"),
      inputCategory: document.getElementById("todo-category"),
      inputShared: document.getElementById("todo-shared"),
      partsContainer: document.getElementById("participants-container"),
      btnCancel: document.getElementById("modal-cancel"),
      btnSave: document.getElementById("modal-save")
    },
    user: {
      addBtn: document.getElementById("add-user-btn"),
      backdrop: document.getElementById("user-modal-backdrop"),
      form: document.getElementById("user-form"),
      inputName: document.getElementById("user-name-input"),
      btnCancel: document.getElementById("user-modal-cancel")
    },
    mainAddBtn: document.getElementById("add-todo-btn"),
    prevMonth: document.getElementById("prev-month"),
    nextMonth: document.getElementById("next-month")
  };

  const itLocale = "it-IT";
  const toISO = d => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const fromISO = str => {
    if (!str) return new Date();
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0); 
  };
  const clean = (str) => str ? String(str).trim().toLowerCase() : "";

  const getCategoryClass = (cat) => {
    if(!cat) return '';
    return 'cat-' + cat.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
  };

  // --- MOBILE & GUIDE LOGIC ---
  function toggleSidebar() {
    REFS.sidebar.classList.toggle('active');
    REFS.sidebarBackdrop.classList.toggle('active');
  }
  REFS.mobileMenuBtn.onclick = toggleSidebar;
  REFS.sidebarBackdrop.onclick = toggleSidebar;

  // Gestione Guida Modal
  REFS.headerGuideBtn.onclick = () => { REFS.guideBackdrop.style.display = "flex"; };
  REFS.guideCloseBtn.onclick = () => { REFS.guideBackdrop.style.display = "none"; };

  function loadUnreadFromStorage() {
      const stored = localStorage.getItem('unread_todos');
      if(stored) {
          state.unreadTodoIds = new Set(JSON.parse(stored));
      }
  }

  function markAsUnread(todoId) {
      state.unreadTodoIds.add(todoId);
      localStorage.setItem('unread_todos', JSON.stringify([...state.unreadTodoIds]));
  }

  function markAsRead(todoId) {
      if(state.unreadTodoIds.has(todoId)) {
          state.unreadTodoIds.delete(todoId);
          localStorage.setItem('unread_todos', JSON.stringify([...state.unreadTodoIds]));
          renderList();
      }
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    REFS.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = "fadeOut 0.5s forwards";
        setTimeout(() => toast.remove(), 500);
    }, 4000);
  }

  function initRealtime() {
    sb.channel('public:todos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, payload => {
          
          loadMonthIndicators();
          loadCounts(); 
          
          let shouldNotify = false;
          let message = "";

          if (state.currentMember && payload.new) {
             const record = payload.new;
             const parts = record.participants || [];
             const amIInvolved = parts.some(p => clean(p.name) === clean(state.currentMember.name));

             if (amIInvolved) {
                 shouldNotify = true;
                 if (payload.eventType === 'INSERT') message = `🆕 Nuovo impegno: ${record.title}`;
                 else if (payload.eventType === 'UPDATE') message = `🔄 Aggiornato: ${record.title}`;
                 markAsUnread(record.id);
             }
          }

          if (payload.new && payload.new.date === toISO(state.selectedDate)) {
             loadTodos().then(() => {
                 renderList();
                 if(shouldNotify) showToast(message);
             });
          } else if (shouldNotify) {
              showToast(message);
          }
      })
      .subscribe();
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    REFS.btnViewPersonal.classList.toggle('active', mode === 'personal');
    REFS.btnViewTeam.classList.toggle('active', mode === 'team');
    renderList();
  }
  REFS.btnViewPersonal.onclick = () => setViewMode('personal');
  REFS.btnViewTeam.onclick = () => setViewMode('team');

  async function reloadAll() {
    await Promise.all([loadCurrentProfile(), loadMonthIndicators(), loadTodos(), loadTeam(), loadCounts()]);
    renderCalendar();
    renderList();
    renderTeamManagement(); 
  }

  async function loadCurrentProfile() {
    if (!state.user) { state.currentMember = null; return; }
    const { data } = await sb.from("team_members").select("*").eq("user_id", state.user.id).single();
    state.currentMember = data ? data : { name: state.user.email }; 
  }

  async function addTeamMember(name) {
      if(!state.user) return;
      await sb.from("team_members").insert({ name: name });
  }

  async function deleteTeamMember(id) {
    if(!state.user) return;
    if(confirm("Sei sicuro di voler rimuovere questo membro dal team?")) {
        await sb.from("team_members").delete().eq("id", id);
        reloadAll();
    }
  }

  async function loadTeam() {
    if(!state.user) { state.teamMembers=[]; return; }
    const {data} = await sb.from("team_members").select("*").order("created_at");
    state.teamMembers = data || [];
  }

  async function loadCounts() {
    if(!state.user) return;
    const {data} = await sb.from("todos").select("participants").eq("done", false);
    const c = {};
    (data||[]).forEach(r => {
      if(Array.isArray(r.participants)) {
        r.participants.forEach(p => { 
            if(!p.done) c[p.name]=(c[p.name]||0)+1; 
        });
      }
    });
    state.memberCounts = c;
    renderTeamManagement(); 
  }

  async function loadMonthIndicators() {
    if(!state.user) return;
    const y=state.currentDate.getFullYear(), m=state.currentDate.getMonth();
    const start = toISO(new Date(y, m, -6, 12, 0, 0));
    const end = toISO(new Date(y, m+1, 14, 12, 0, 0));
    const {data} = await sb.from("todos").select("date").gte("date", start).lte("date", end);
    const c = {};
    (data||[]).forEach(r => c[r.date] = (c[r.date]||0)+1);
    state.monthCounts = c;
  }

  async function loadTodos() {
    if(!state.user) { state.todos=[]; return; }
    const {data} = await sb.from("todos").select("*").eq("date", toISO(state.selectedDate)).order("position", {ascending: true});
    state.todos = (data||[]).map(t => ({...t, participants: Array.isArray(t.participants)?t.participants:[]}));
  }

  async function toggleStatus(todo) {
    if (!state.currentMember) return alert("Rifare login.");
    const myName = state.currentMember.name;
    const myPartIndex = todo.participants.findIndex(p => clean(p.name) === clean(myName));
    
    if(myPartIndex === -1) { alert(`Non sei partecipante.`); return; }

    let newParts = JSON.parse(JSON.stringify(todo.participants));
    newParts[myPartIndex].done = !newParts[myPartIndex].done; 
    const newDone = newParts.every(p => p.done);

    const { error } = await sb.from("todos").update({done: newDone, participants: newParts}).eq("id", todo.id);
    if (!error) await reloadAll();
  }

  async function saveTodo(id) {
    if(!state.currentMember) return alert("Login richiesto.");
    const title = REFS.modal.inputTitle.value.trim();
    if(!title) return;
    
    const selectedNames = Array.from(document.querySelectorAll('input[name="part-opt"]:checked')).map(c=>c.value);
    const priority = REFS.modal.inputPriority.value;
    const category = REFS.modal.inputCategory.value;
    const shared = REFS.modal.inputShared.checked;

    let oldParts = [];
    if(id) { const t = state.todos.find(x=>x.id===id); if(t) oldParts = t.participants; }
    
    const newParts = selectedNames.map(name => {
      const existing = oldParts.find(p => p.name === name);
      return { name, done: existing ? existing.done : false };
    });
    
    const allDone = newParts.length > 0 && newParts.every(p => p.done);
    
    let position = 0;
    if (!id && state.todos.length > 0) { const last = state.todos[state.todos.length - 1]; position = (last.position || 0) + 1000; } 
    else if (id) { const t = state.todos.find(x=>x.id===id); position = t ? t.position : 0; }

    const payload = {
      title, 
      notes: REFS.modal.inputNotes.value, 
      date: REFS.modal.inputDate.value,
      shared, 
      participants: newParts, 
      done: allDone,
      priority, 
      category,
      position 
    };
    
    if(id) await sb.from("todos").update(payload).eq("id", id);
    else await sb.from("todos").insert({...payload, user_id: state.user.id});
    
    REFS.modal.backdrop.style.display = "none";
    state.selectedDate = fromISO(payload.date);
    state.currentDate = new Date(state.selectedDate);
    await reloadAll();
  }

  async function deleteTodo(id) {
    if(confirm("Eliminare definitivamente?")) {
      await sb.from("todos").delete().eq("id", id);
      state.selectedTodoId = null;
      REFS.detail.backdrop.style.display = "none"; 
      await reloadAll();
    }
  }

  function renderCalendar() {
    const y=state.currentDate.getFullYear(), m=state.currentDate.getMonth();
    REFS.monthLabel.textContent = state.currentDate.toLocaleDateString(itLocale, {month:'long', year:'numeric'});
    const firstDay = new Date(y, m, 1).getDay();
    const offset = (firstDay + 6) % 7; 
    const daysInM = new Date(y, m+1, 0).getDate();
    REFS.calendarDays.innerHTML = "";
    
    for(let i=0; i<offset; i++) REFS.calendarDays.appendChild(Object.assign(document.createElement("div"), {className:"day-cell day-outside"}));
    
    for(let i=1; i<=daysInM; i++) {
      const d = new Date(y, m, i, 12, 0, 0);
      const cell = document.createElement("div"); cell.className = "day-cell";
      
      if(toISO(d) === toISO(new Date())) cell.innerHTML += `<span class="day-today">${i}</span>`;
      else cell.innerHTML = `<span>${i}</span>`;
      
      if(toISO(d) === toISO(state.selectedDate)) cell.classList.add("day-selected");
      
      if(state.monthCounts[toISO(d)]) {
        const dots = document.createElement("div"); dots.className="day-dots";
        for(let k=0; k<Math.min(state.monthCounts[toISO(d)],3); k++) dots.appendChild(Object.assign(document.createElement("div"),{className:"day-dot"}));
        cell.appendChild(dots);
      }
      cell.onclick = () => { 
          state.selectedDate = d; 
          state.selectedTodoId = null; 
          renderCalendar(); 
          loadTodos().then(() => { renderList(); }); 
          if(window.innerWidth <= 768) {
             REFS.sidebar.classList.remove('active');
             REFS.sidebarBackdrop.classList.remove('active');
          }
      };
      REFS.calendarDays.appendChild(cell);
    }
  }

  function renderTeamManagement() {
      REFS.teamListContainer.innerHTML = "";
      if (state.teamMembers.length === 0) {
          REFS.teamListContainer.innerHTML = `<div style="text-align:center; padding:10px; color:#999; font-size:12px;">Nessun membro</div>`;
          return;
      }
      state.teamMembers.forEach(member => {
          const row = document.createElement("div");
          row.className = "team-member-row";
          const count = state.memberCounts[member.name] || 0;
          
          const info = document.createElement("div");
          info.className = "team-member-info";
          const initial = member.name.charAt(0).toUpperCase();
          info.innerHTML = `<div class="member-avatar">${initial}</div><span>${member.name}</span>`;
          
          const stats = document.createElement("div");
          stats.className = "member-stats";
          if(count > 0) stats.innerHTML += `<span class="member-count-badge" title="${count} task aperti">${count}</span>`;
          
          const delBtn = document.createElement("button");
          delBtn.className = "delete-member-btn";
          delBtn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>`;
          delBtn.onclick = () => deleteTeamMember(member.id);
          
          stats.appendChild(delBtn);
          row.appendChild(info);
          row.appendChild(stats);
          REFS.teamListContainer.appendChild(row);
      });
  }

  function renderList() {
    REFS.listsContainer.innerHTML = "";
    REFS.selectedDateLabel.textContent = state.selectedDate.toLocaleDateString(itLocale, {weekday:'long', day:'numeric', month:'long'});
    
    if(!state.user || state.todos.length === 0) {
      REFS.todoEmpty.style.display = "block"; REFS.counts.total.textContent=""; return;
    }
    REFS.todoEmpty.style.display = "none";

    let membersToShow = state.viewMode === 'personal' 
        ? (state.currentMember ? [state.currentMember] : [{name: state.user.email}]) 
        : state.teamMembers;

    let anyTaskShown = false;

    membersToShow.forEach(member => {
      const memberTodos = state.todos.filter(t => t.participants && t.participants.some(p => clean(p.name) === clean(member.name)));

      if(memberTodos.length > 0) {
        anyTaskShown = true;
        const section = document.createElement("div");
        section.className = "user-todo-section";
        const title = document.createElement("div");
        title.className = "user-section-title";
        
        const hasUnread = memberTodos.some(t => state.unreadTodoIds.has(t.id));
        
        title.textContent = member.name;
        if(state.currentMember && clean(member.name) === clean(state.currentMember.name)) {
            title.style.color = "var(--ios-blue)";
        }
        
        if(hasUnread) {
            const dot = document.createElement('span');
            dot.className = 'notification-dot';
            title.appendChild(dot);
        }
        
        section.appendChild(title);

        const ul = document.createElement("ul");
        ul.className = "apple-list";

        memberTodos.forEach(t => {
          const li = document.createElement("li"); 
          li.className = "todo-item";
          li.dataset.id = t.id;
          
          const check = document.createElement("div"); check.className = "check-circle" + (t.done ? " checked" : "");
          if(state.currentMember) {
             const myPart = t.participants.find(p => clean(p.name) === clean(state.currentMember.name));
             if(!t.done && myPart && myPart.done) check.style.borderColor = "var(--ios-green)"; 
          }
          check.onclick = (e) => { e.stopPropagation(); toggleStatus(t); };
          
          const content = document.createElement("div"); content.className = "todo-content";
          const catClass = getCategoryClass(t.category);
          const catHTML = t.category ? `<span class="category-pill ${catClass}">${t.category}</span>` : '';
          
          const unreadClass = state.unreadTodoIds.has(t.id) ? 'font-weight:600' : '';
          
          content.innerHTML = `<div class="todo-head-row">${catHTML}<div class="todo-title ${t.done?'done':''}" style="${unreadClass}">${t.title}</div></div>`;
          
          const actions = document.createElement("div"); actions.className = "todo-actions";
          actions.innerHTML = `
            <button class="act-btn edit-btn">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button class="act-btn del-btn">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>`;
          
          const openTask = () => { 
              markAsRead(t.id); 
              state.selectedTodoId=t.id; 
              if(state.user) renderDetail(); 
          };
          
          const clickEdit = (e) => {
               e.stopPropagation();
               markAsRead(t.id);
               openModal(t);
          };

          actions.querySelector(".edit-btn").onclick = clickEdit;
          actions.querySelector(".del-btn").onclick = (e) => { e.stopPropagation(); deleteTodo(t.id); };
          
          li.append(check, content, actions);
          li.onclick = openTask;
          ul.appendChild(li);
        });
        section.appendChild(ul);
        REFS.listsContainer.appendChild(section);
      }
    });

    if(!anyTaskShown) { REFS.todoEmpty.style.display = "block"; REFS.todoEmpty.textContent = "Nessun impegno trovato."; }

    const total = state.todos.length; const done = state.todos.filter(t=>t.done).length;
    REFS.counts.total.textContent = `Totale: ${total}`; 
    REFS.counts.done.textContent = `Fatti: ${done}`; 
    REFS.counts.open.textContent = `Aperti: ${total-done}`;
  }

  function renderDetail() {
    const t = state.todos.find(x => x.id === state.selectedTodoId);
    if(!t) return;
    
    REFS.detail.backdrop.style.display = "flex";
    
    REFS.detail.title.textContent = t.title; 
    REFS.detail.notes.textContent = t.notes || "Nessuna nota aggiuntiva.";
    REFS.detail.meta.innerHTML = "";
    
    if(t.category) {
       const bC = document.createElement("span"); 
       bC.className = `category-pill ${getCategoryClass(t.category)}`; 
       bC.textContent = t.category;
       REFS.detail.meta.appendChild(bC);
    }

    REFS.detail.parts.innerHTML = "";
    if(t.participants.length) {
      t.participants.forEach(p => {
        const row = document.createElement("div"); 
        row.className="participant-chip"; 
        row.style.cursor="default";
        
        const statusColor = p.done ? 'var(--ios-green)' : '#C6C6C8';
        const statusIcon = p.done 
            ? `<svg width="14" height="14" fill="${statusColor}" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/></svg>` 
            : `<svg width="14" height="14" fill="${statusColor}" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none"/></svg>`;

        row.innerHTML = `
            <div class="chip-visual" style="padding:6px 12px; font-size:13px; justify-content: space-between; min-width: 120px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <div class="initial" style="width:20px; height:20px; font-size:10px;">${p.name.charAt(0).toUpperCase()}</div> 
                    ${p.name} 
                </div>
                <div style="margin-left:8px; display:flex; align-items:center;">${statusIcon}</div>
            </div>`;
        
        REFS.detail.parts.appendChild(row);
      });
    } else { REFS.detail.parts.textContent = "-"; }
    
    REFS.detail.btnEdit.onclick = () => {
        REFS.detail.backdrop.style.display = "none";
        openModal(t);
    };
  }

  function openModal(todo) {
    if(!state.user) return alert("Login richiesto");
    REFS.modal.backdrop.style.display = "flex";
    REFS.modal.partsContainer.innerHTML = "";
    const myName = state.currentMember ? state.currentMember.name : "";
    
    const selectCat = REFS.modal.inputCategory;
    const catRow = selectCat.closest('.form-row'); 
    
    if(catRow && !catRow.classList.contains('modified-for-grid')) {
        catRow.style.display = 'block'; 
        catRow.innerHTML = ''; 
        catRow.classList.add('modified-for-grid');
        
        const label = document.createElement('div');
        label.className = 'form-header-label';
        label.style.marginLeft = '0';
        label.textContent = "Categoria";
        catRow.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'participants-grid';
        grid.id = 'custom-cat-grid';
        catRow.appendChild(grid);
        
        const categories = [
            { 
                val: "Video", label: "Video", 
                icon: `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M0 1a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V1zm4 0v6h8V1H4zm8 8H4v6h8V9zM1 1v2h2V1H1zm2 3H1v2h2V4zM1 7v2h2V7H1zm2 3H1v2h2v-2zm-2 3v2h2v-2H1zM15 1h-2v2h2V1zm-2 3v2h2V4h-2zm2 3h-2v2h2V7zm-2 3v2h2v-2h-2zm2 3h-2v2h2v-2z"/></svg>` 
            },
            { 
                val: "Reel", label: "Reel", 
                icon: `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M11 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6zM5 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H5z"/><path d="M8 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>` 
            },
            { 
                val: "Short", label: "Short", 
                icon: `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8zm8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></svg>` 
            },
            { 
                val: "Storia", label: "Storia", 
                icon: `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>` 
            }
        ];

        categories.forEach(c => {
            const labelEl = document.createElement("label");
            labelEl.className = "participant-chip";
            
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "custom_cat_opt"; 
            radio.value = c.val;
            
            radio.onchange = () => { selectCat.value = c.val; };

            const visual = document.createElement("div");
            visual.className = "chip-visual";
            visual.innerHTML = `${c.icon} ${c.label}`;
            
            labelEl.append(radio, visual);
            grid.appendChild(labelEl);
        });
    }

    state.teamMembers.forEach(m => {
        const label = document.createElement("label"); label.className="participant-chip";
        const chk = document.createElement("input"); chk.type="checkbox"; chk.name="part-opt"; chk.value=m.name;
        if(todo) { if(todo.participants.some(p => clean(p.name) === clean(m.name))) chk.checked=true; } 
        else { if(clean(m.name) === clean(myName)) chk.checked=true; }
        
        const visual = document.createElement("div"); visual.className = "chip-visual";
        visual.innerHTML = `<div class="initial">${m.name.charAt(0)}</div> ${m.name}`;
        label.appendChild(chk); label.appendChild(visual);
        REFS.modal.partsContainer.appendChild(label);
    });

    if(todo) {
        REFS.modal.form.dataset.editId = todo.id; REFS.modal.title.textContent = "Modifica Task";
        REFS.modal.inputTitle.value = todo.title; REFS.modal.inputNotes.value = todo.notes || "";
        REFS.modal.inputDate.value = todo.date; REFS.modal.inputShared.checked = todo.shared; 
        REFS.modal.inputPriority.value = todo.priority || 'media';
        
        const currentCat = todo.category || 'Video';
        REFS.modal.inputCategory.value = currentCat; 
        const radios = document.querySelectorAll('input[name="custom_cat_opt"]');
        radios.forEach(r => { r.checked = (r.value === currentCat); });

    } else {
        delete REFS.modal.form.dataset.editId; REFS.modal.title.textContent = "Nuovo Task";
        REFS.modal.inputTitle.value = ""; REFS.modal.inputNotes.value = "";
        REFS.modal.inputDate.value = toISO(state.selectedDate); REFS.modal.inputShared.checked = true; 
        REFS.modal.inputPriority.value = 'media';
        
        REFS.modal.inputCategory.value = 'Video';
        const radios = document.querySelectorAll('input[name="custom_cat_opt"]');
        radios.forEach(r => { r.checked = (r.value === 'Video'); });
    }
  }

  REFS.prevMonth.onclick = () => { const current = state.currentDate; state.currentDate = new Date(current.getFullYear(), current.getMonth()-1, 1, 12, 0, 0); reloadAll(); };
  REFS.nextMonth.onclick = () => { const current = state.currentDate; state.currentDate = new Date(current.getFullYear(), current.getMonth()+1, 1, 12, 0, 0); reloadAll(); };
  
  REFS.detail.btnClose.onclick = () => REFS.detail.backdrop.style.display="none";

  REFS.mainAddBtn.onclick = () => openModal(null);
  REFS.modal.btnCancel.onclick = () => REFS.modal.backdrop.style.display="none";
  REFS.modal.btnSave.onclick = () => saveTodo(REFS.modal.form.dataset.editId);
  
  let isSignUpMode = false;
  
  function toggleLandingAuthMode() {
      isSignUpMode = !isSignUpMode;
      if(isSignUpMode) {
          REFS.authTitle.textContent = "Registrati";
          REFS.authSubtitle.textContent = "Crea un nuovo account per accedere";
          REFS.landingSubmitBtn.textContent = "Registrati";
          REFS.landingSwitchBtn.textContent = "Accedi";
          document.getElementById('auth-switch-text').textContent = "Hai già un account?";
      } else {
          REFS.authTitle.textContent = "Benvenuto";
          REFS.authSubtitle.textContent = "Accedi per continuare";
          REFS.landingSubmitBtn.textContent = "Accedi";
          REFS.landingSwitchBtn.textContent = "Registrati";
          document.getElementById('auth-switch-text').textContent = "Non hai un account?";
      }
      REFS.landingForm.reset();
  }

  REFS.landingSwitchBtn.onclick = (e) => { e.preventDefault(); toggleLandingAuthMode(); };

  REFS.landingForm.onsubmit = async (e) => { 
      e.preventDefault(); 
      const email = REFS.landingEmail.value.toLowerCase().trim(); 
      const password = REFS.landingPass.value; 
      let data, error; 
      
      if (isSignUpMode) { 
          const res = await sb.auth.signUp({ email, password }); 
          data = res.data; error = res.error; 
          if (!error && data.user) { 
              alert("Registrazione effettuata! Ora puoi accedere."); 
              isSignUpMode = false; toggleLandingAuthMode(); return; 
          } 
      } else { 
          const res = await sb.auth.signInWithPassword({ email, password }); 
          data = res.data; error = res.error; 
      } 
      
      if(error) alert(error.message); 
      else if (data.user) { 
          state.user = data.user; 
          handleLoginSuccess();
      } 
  };

  REFS.headerLogoutBtn.onclick = async () => {
      if(confirm("Vuoi uscire?")) {
          await sb.auth.signOut();
          state.user = null;
          state.currentMember = null;
          handleLogout();
      }
  };

  function handleLoginSuccess() {
      REFS.landingPage.style.display = 'none';
      REFS.appLayout.style.display = 'block';
      reloadAll();
      initRealtime();
  }

  function handleLogout() {
      REFS.landingPage.style.display = 'flex';
      REFS.appLayout.style.display = 'none';
  }

  (async function(){ 
      renderCalendar(); 
      loadUnreadFromStorage(); 
      
      const {data} = await sb.auth.getUser(); 
      if(data?.user) { 
          state.user = data.user;
          handleLoginSuccess();
      } else {
          handleLogout();
      }
  })();
});