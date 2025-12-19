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
    dragSrcEl: null
  };

  // --- REFS ---
  const REFS = {
    monthLabel: document.getElementById("month-label"),
    calendarDays: document.getElementById("calendar-days"),
    selectedDateLabel: document.getElementById("selected-date-label"),
    listsContainer: document.getElementById("lists-container"), 
    todoEmpty: document.getElementById("todo-empty"),
    btnViewPersonal: document.getElementById("view-personal"),
    btnViewTeam: document.getElementById("view-team"),
    toastContainer: document.getElementById("toast-container"),
    
    // Team Management Container
    teamListContainer: document.getElementById("team-list-container"),
    
    counts: {
      total: document.getElementById("todo-count-total"),
      done: document.getElementById("todo-count-done"),
      open: document.getElementById("todo-count-open")
    },
    // DETTAGLIO MODAL
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
    login: {
      btn: document.getElementById("login-toggle-btn"),
      backdrop: document.getElementById("login-modal-backdrop"),
      form: document.getElementById("login-form"),
      email: document.getElementById("login-email"),
      pass: document.getElementById("login-password"),
      btnCancel: document.getElementById("login-modal-cancel"),
      title: document.getElementById("auth-modal-title"),
      subtitle: document.getElementById("auth-modal-subtitle"),
      submitBtn: document.getElementById("auth-submit-btn"),
      switchBtn: document.getElementById("auth-switch-btn"),
      switchText: document.getElementById("auth-switch-text")
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

  // Helper classi categorie
  const getCategoryClass = (cat) => {
    if(!cat) return '';
    return 'cat-' + cat.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
  };

  // --- NOTIFICHE ---
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

  // --- SUPABASE REALTIME ---
  function initRealtime() {
    sb.channel('public:todos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, payload => {
          loadMonthIndicators();
          loadCounts(); 
          if (payload.new && payload.new.date === toISO(state.selectedDate)) {
             loadTodos().then(() => renderList());
          }
          if (state.currentMember && payload.eventType === 'INSERT') {
             const parts = payload.new.participants || [];
             const involved = parts.some(p => clean(p.name) === clean(state.currentMember.name));
             if (involved) showToast(`Nuovo task assegnato: ${payload.new.title}`);
          }
      })
      .subscribe();
  }

  // --- VIEW MODE ---
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

  // --- DB CALLS ---
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

  // --- ACTIONS ---
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

  // --- RENDERING ---
  
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
      cell.onclick = () => { state.selectedDate = d; state.selectedTodoId = null; renderCalendar(); loadTodos().then(() => { renderList(); }); };
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
        title.textContent = member.name;
        if(state.currentMember && clean(member.name) === clean(state.currentMember.name)) title.style.color = "var(--ios-blue)";
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
          
          content.innerHTML = `<div class="todo-head-row">${catHTML}<div class="todo-title ${t.done?'done':''}">${t.title}</div></div>`;
          
          const actions = document.createElement("div"); actions.className = "todo-actions";
          // ICONE STILIZZATE APPLE (SVG) PER LA LISTA
          actions.innerHTML = `
            <button class="act-btn edit-btn">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button class="act-btn del-btn">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>`;
          actions.querySelector(".edit-btn").onclick = (e) => { e.stopPropagation(); openModal(t); };
          actions.querySelector(".del-btn").onclick = (e) => { e.stopPropagation(); deleteTodo(t.id); };
          
          li.append(check, content, actions);
          li.onclick = () => { state.selectedTodoId=t.id; renderDetail(); };
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
        row.innerHTML = `<div class="chip-visual" style="padding:4px 10px; font-size:12px;"><div class="initial" style="width:16px; height:16px; font-size:9px;">${p.name.charAt(0)}</div> ${p.name} ${p.done ? '✅' : ''}</div>`;
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
    
    // --- GESTIONE CATEGORIE CON ICONE (Sostituzione Select con Chips) ---
    // 1. Trova il select originale e nascondilo
    const selectCat = REFS.modal.inputCategory;
    const catRow = selectCat.closest('.form-row'); 
    
    // Modifica CSS 'al volo' per adattare la griglia se non è già stato fatto
    if(catRow && !catRow.classList.contains('modified-for-grid')) {
        catRow.style.display = 'block'; // Rimuove flex per far stare la griglia
        catRow.innerHTML = ''; // Pulisce il contenuto (label e select)
        catRow.classList.add('modified-for-grid');
        
        // Ricrea Header Label
        const label = document.createElement('div');
        label.className = 'form-header-label';
        label.style.marginLeft = '0';
        label.textContent = "Categoria";
        catRow.appendChild(label);

        // Crea Container Grid
        const grid = document.createElement('div');
        grid.className = 'participants-grid';
        grid.id = 'custom-cat-grid';
        catRow.appendChild(grid);
        
        // Definisci le categorie con SVG
        const categories = [
            { 
                val: "Reel-Shorts", label: "Reel", 
                icon: `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M11 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h6zM5 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H5z"/><path d="M8 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>` 
            },
            { 
                val: "Video", label: "Video", 
                icon: `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M0 1a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V1zm4 0v6h8V1H4zm8 8H4v6h8V9zM1 1v2h2V1H1zm2 3H1v2h2V4zM1 7v2h2V7H1zm2 3H1v2h2v-2zm-2 3v2h2v-2H1zM15 1h-2v2h2V1zm-2 3v2h2V4h-2zm2 3h-2v2h2V7zm-2 3v2h2v-2h-2zm2 3h-2v2h2v-2z"/></svg>` 
            },
            { 
                val: "Post IG", label: "Instagram", 
                icon: `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.917 3.917 0 0 0-1.417.923A3.927 3.927 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.916 3.916 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.926 3.926 0 0 0-.923-1.417A3.911 3.911 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0h.003zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599.28.28.453.546.598.92.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.47 2.47 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.486-.276a2.478 2.478 0 0 1-.919-.598 2.48 2.48 0 0 1-.599-.919c-.11-.281-.24-.705-.275-1.485-.038-.843-.047-1.096-.047-3.232 0-2.136.009-2.388.047-3.231.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92.28-.28.546-.453.92-.598.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045v.002zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92zm-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217zm0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334z"/></svg>` 
            },
            { 
                val: "Post YT", label: "Community", 
                icon: `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4.414a1 1 0 0 0-.707.293L.854 15.146A.5.5 0 0 1 0 14.793V2zm5 4a1 1 0 1 0-2 0 1 1 0 0 0 2 0zm4 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0zm3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>` 
            },
            { 
                val: "Generale", label: "Generale", 
                icon: `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3zm-8.322.12C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139z"/></svg>` 
            }
        ];

        categories.forEach(c => {
            const labelEl = document.createElement("label");
            labelEl.className = "participant-chip";
            
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "custom_cat_opt"; // Nome univoco
            radio.value = c.val;
            
            // Sincronizza il select nascosto
            radio.onchange = () => { selectCat.value = c.val; };

            const visual = document.createElement("div");
            visual.className = "chip-visual";
            visual.innerHTML = `${c.icon} ${c.label}`;
            
            labelEl.append(radio, visual);
            grid.appendChild(labelEl);
        });
    }
    
    // --- FINE INIEZIONE CUSTOM UI ---

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
        
        // Sincronizza Categoria Custom
        const currentCat = todo.category || 'Reel-Shorts';
        REFS.modal.inputCategory.value = currentCat; // Setta anche il select nascosto
        const radios = document.querySelectorAll('input[name="custom_cat_opt"]');
        radios.forEach(r => { r.checked = (r.value === currentCat); });

    } else {
        delete REFS.modal.form.dataset.editId; REFS.modal.title.textContent = "Nuovo Task";
        REFS.modal.inputTitle.value = ""; REFS.modal.inputNotes.value = "";
        REFS.modal.inputDate.value = toISO(state.selectedDate); REFS.modal.inputShared.checked = true; 
        REFS.modal.inputPriority.value = 'media';
        
        // Default Categoria Custom
        REFS.modal.inputCategory.value = 'Reel-Shorts';
        const radios = document.querySelectorAll('input[name="custom_cat_opt"]');
        radios.forEach(r => { r.checked = (r.value === 'Reel-Shorts'); });
    }
  }

  // LISTENERS
  REFS.prevMonth.onclick = () => { const current = state.currentDate; state.currentDate = new Date(current.getFullYear(), current.getMonth()-1, 1, 12, 0, 0); reloadAll(); };
  REFS.nextMonth.onclick = () => { const current = state.currentDate; state.currentDate = new Date(current.getFullYear(), current.getMonth()+1, 1, 12, 0, 0); reloadAll(); };
  
  // Close Detail Modal
  REFS.detail.btnClose.onclick = () => REFS.detail.backdrop.style.display="none";

  REFS.mainAddBtn.onclick = () => openModal(null);
  REFS.modal.btnCancel.onclick = () => REFS.modal.backdrop.style.display="none";
  REFS.modal.btnSave.onclick = () => saveTodo(REFS.modal.form.dataset.editId);
  
  let isSignUpMode = false;
  function updateAuthModalUI() {
      if (isSignUpMode) { REFS.login.title.textContent = "Registrazione"; REFS.login.subtitle.textContent = "Crea un account"; REFS.login.submitBtn.textContent = "Registrati"; REFS.login.switchText.textContent = "Hai un account?"; REFS.login.switchBtn.textContent = "Accedi"; } 
      else { REFS.login.title.textContent = "Login"; REFS.login.subtitle.textContent = "Accedi"; REFS.login.submitBtn.textContent = "Accedi"; REFS.login.switchText.textContent = "Non hai un account?"; REFS.login.switchBtn.textContent = "Registrati"; } REFS.login.form.reset();
  }
  REFS.login.switchBtn.onclick = () => { isSignUpMode = !isSignUpMode; updateAuthModalUI(); };
  REFS.login.btn.onclick = () => { if(state.user) { if(confirm("Logout?")) { sb.auth.signOut(); state.user=null; state.currentMember=null; reloadAll(); } } else { isSignUpMode = false; updateAuthModalUI(); REFS.login.backdrop.style.display="flex"; } };
  REFS.login.btnCancel.onclick = () => REFS.login.backdrop.style.display="none";
  REFS.login.form.onsubmit = async (e) => { e.preventDefault(); const email = REFS.login.email.value.toLowerCase().trim(); const password = REFS.login.pass.value; let data, error; if (isSignUpMode) { const res = await sb.auth.signUp({ email, password }); data = res.data; error = res.error; if (!error && data.user) { alert("Registrazione ok!"); isSignUpMode = false; updateAuthModalUI(); return; } } else { const res = await sb.auth.signInWithPassword({ email, password }); data = res.data; error = res.error; } if(error) alert(error.message); else if (data.user) { state.user = data.user; REFS.login.backdrop.style.display="none"; reloadAll(); } };
  REFS.user.addBtn.onclick = () => { if(!state.user) return alert("Login!"); REFS.user.backdrop.style.display="flex"; };
  REFS.user.btnCancel.onclick = () => REFS.user.backdrop.style.display="none";
  REFS.user.form.onsubmit = async (e) => { e.preventDefault(); await addTeamMember(REFS.user.inputName.value); REFS.user.backdrop.style.display="none"; reloadAll(); };

  (async function(){ renderCalendar(); const {data} = await sb.auth.getUser(); if(data?.user) { state.user=data.user; await reloadAll(); initRealtime(); } })();
});