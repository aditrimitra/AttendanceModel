import {
  auth,
  secondaryAuth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  ref,
  set,
  get,
  child,
  onValue,
  push,
  update,
  sendPasswordResetEmail
} from "./firebase-init.js";

// Helper: Format Name to Title Case (e.g. AKASH -> Akash)
const formatTitleCase = (str) => {
    if (!str) return "";
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// DOM Elements
const views = {
  login: document.getElementById("login-view"),
  admin: document.getElementById("admin-view"),
};

// Switch view logic
function switchView(targetViewId) {
  Object.values(views).forEach((view) => {
    if (view) view.classList.remove("active-view");
  });
  if (views[targetViewId.replace("-view", "")]) {
    views[targetViewId.replace("-view", "")].classList.add("active-view");
  }
}

// Toast Notification
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Data Helpers
const snapshotToObj = (snap) => {
    if(!snap.exists()) return {};
    return snap.val();
};

// Authentication State Listener
let isAdminMaster = false;
let isHOD = false;
let currentAdminData = null;
let currentAdminStudents = [];

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const dbRef = ref(db);
    try {
      const snapshot = await get(child(dbRef, `users/${user.uid}`));
      if (snapshot.exists()) {
        const userData = snapshot.val();
        currentAdminData = userData;
        
        // Power User Check: aditrimitra@gmail.com OR role is master OR role is admin
        isAdminMaster = (user.email === "aditrimitra@gmail.com" || userData.role === "master" || userData.role === "admin");
        isHOD = (userData.role === "hod");
        
        const isAuthorized = (isAdminMaster || isHOD || userData.role === "admin");

        if (isAuthorized) {
          initAdminDashboard(user, userData);
          switchView("admin");
        } else {
          window.location.href = "index.html";
        }
      } else {
        showToast("User role not found.", "error");
        signOut(auth);
      }
    } catch (error) {
      console.error("Error fetching user data", error);
    }
  } else {
    switchView("login");
  }
});

const hamburger = document.getElementById("hamburger-menu");
const mobileMenu = document.getElementById("mobile-menu");
const closeMenu = document.getElementById("close-menu");

if (hamburger && mobileMenu) {
    const toggleMenu = () => {
        hamburger.classList.toggle("open");
        mobileMenu.classList.toggle("active");
    };
    hamburger.addEventListener("click", toggleMenu);
    closeMenu?.addEventListener("click", toggleMenu);

    // Click outside to close (Admin)
    document.addEventListener("click", (e) => {
        if (!mobileMenu.contains(e.target) && !hamburger.contains(e.target) && mobileMenu.classList.contains("active")) {
            hamburger.classList.remove("open");
            mobileMenu.classList.remove("active");
        }
    });
}

// Admin Login Logic
document.getElementById("admin-login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btn-login-submit");
  btn.innerHTML =
    'Signing in... <span class="material-icons">hourglass_empty</span>';
  btn.disabled = true;

  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    errorEl.textContent = error.message;
  } finally {
    btn.innerHTML = 'Sign In <span class="material-icons">east</span>';
    btn.disabled = false;
  }
});

// Logout
const handleLogout = async () => {
  try {
    await signOut(auth);
    showToast("Logged out");
  } catch (error) {
    showToast("Logout failed", "error");
  }
};
document.getElementById("btn-logout-admin-desktop")?.addEventListener("click", handleLogout);
document.getElementById("btn-logout-admin-mobile")?.addEventListener("click", handleLogout);

// TAB SWITCHING LOGIC
const showConfirm = (title, msg) => {
    return new Promise((resolve) => {
        const modal = document.getElementById("confirm-modal");
        const titleEl = document.getElementById("confirm-title");
        const msgEl = document.getElementById("confirm-msg");
        const okBtn = document.getElementById("confirm-ok");
        const cancelBtn = document.getElementById("confirm-cancel");

        if (!modal || !titleEl || !msgEl || !okBtn || !cancelBtn) {
            console.error("Modal elements missing");
            return resolve(confirm(msg)); // Fallback if modal DOM not found
        }

        titleEl.textContent = title;
        msgEl.textContent = msg;
        modal.classList.add("active");

        const cleanup = (val) => {
            modal.classList.remove("active");
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(val);
        };

        okBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);
    });
};

const allTabs = document.querySelectorAll(".nav-tab, .mobile-nav-tab");
allTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        const targetTab = tab.dataset.tab;
        if (!targetTab) return;

        // Sync all tabs with the same data-tab
        allTabs.forEach(t => t.classList.remove("active"));
        document.querySelectorAll(`[data-tab="${targetTab}"]`).forEach(t => t.classList.add("active"));
        
        // Update panels
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        document.getElementById(targetTab)?.classList.add("active");

        // Close mobile menu if open
        hamburger?.classList.remove("open");
        mobileMenu?.classList.remove("active");

        if (targetTab === "leaderboard-view") {
            loadLeaderboard();
        }
    });
});
// Admin Global Notification Bell Click
document.getElementById("admin-global-notif")?.addEventListener("click", () => {
     // Trigger click on Queries tab button
     const queriesTabStr = 'queries-view';
     document.querySelectorAll(`[data-tab="${queriesTabStr}"]`).forEach(t => t.click());
});

// --- ADMIN DASHBOARD ---
function initAdminDashboard(user, userData) {
  currentAdminData = userData;
  const adminNameStr = isAdminMaster ? `${userData.name} (Admin)` : `${userData.name} (HOD)`;
  document.getElementById("admin-name-display-desktop").textContent = adminNameStr;
  document.getElementById("admin-name-display-mobile").textContent = adminNameStr;

  const fieldSubjects = document.getElementById("field-subjects");
  const errorEl = document.getElementById("admin-reg-error");

  const tabAccounts = document.getElementById("tab-accounts");
  const tabRoles = document.getElementById("tab-roles");
  const mobTabAccounts = document.getElementById("mob-tab-accounts");
  const mobTabRoles = document.getElementById("mob-tab-roles");

  if (isAdminMaster) {
      tabAccounts?.classList.remove("hidden");
      tabRoles?.style.setProperty("display", "flex", "important");
      mobTabAccounts?.style.setProperty("display", "flex", "important");
      mobTabRoles?.style.setProperty("display", "flex", "important");
  } else {
      tabAccounts?.classList.add("hidden");
      tabRoles?.style.setProperty("display", "none", "important");
      mobTabAccounts?.style.setProperty("display", "none", "important");
      mobTabRoles?.style.setProperty("display", "none", "important");
  }

  // Set default date to today
  document.getElementById("admin-date").valueAsDate = new Date();

  // Listen for subjects based on current selection
  const refreshGlobalSubjects = async () => {
    const branch = document.getElementById("admin-branch")?.value;
    const sem = document.getElementById("admin-sem")?.value;
    const sel = document.getElementById("admin-subject");
    if (!branch || !sem || !sel) return;

    const subjectsRef = ref(db, `subjects/${branch}/${sem}`);
    const snap = await get(subjectsRef);
    const oldVal = sel.value;
    
    if (snap.exists()) {
        const allSubjects = Object.keys(snap.val());
        let subjectsToShow = allSubjects;

        if (!isAdminMaster && userData.subjects) {
            subjectsToShow = allSubjects.filter(s => userData.subjects.includes(s));
        }

        // We only populate if we aren't currently in "Timetable Filtered" mode (refreshSubjFilter handles that)
        // But for fallback, we need this list.
        return subjectsToShow;
    }
    return [];
  };

  // Re-run filter when date/branch/semester changes
  const refreshSubjFilter = async () => {
      const branch = document.getElementById("admin-branch")?.value;
      const sem = document.getElementById("admin-sem")?.value;
      const date = document.getElementById("admin-date")?.value;
      
      const sel = document.getElementById("admin-subject");
      if(!branch || !sem || !date) {
          sel.innerHTML = '<option value="" disabled selected>Select Branch/Semester/Date First</option>';
          return;
      }

      const dateObj = new Date(date);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const ttSnap = await get(ref(db, `timetable/${branch}/${sem}/${dayName}`));
      
      const ttEntries = ttSnap.exists() ? Object.values(ttSnap.val()) : [];
      const currentVal = sel.value;
      sel.innerHTML = '<option value="" disabled selected>Select Subject</option>';

      let allowedEntries = [];
      if (isAdminMaster) {
          if (ttEntries.length > 0) {
              allowedEntries = ttEntries;
          } else {
              // Fallback: Fetch all global subjects for this Branch/Sem
              const globalSubjs = await refreshGlobalSubjects();
              allowedEntries = globalSubjs.map(s => ({ subject: s, timeSlot: "Anytime", teacherName: "Admin" }));
              if (allowedEntries.length === 0) {
                  allowedEntries = [{ subject: "Generic Class", timeSlot: "Anytime", teacherName: "Admin" }];
              }
          }
      } else {
          const teacherSubjects = userData.subjects || [];
          allowedEntries = ttEntries.filter(e => teacherSubjects.includes(e.subject));
          if (ttEntries.length === 0) {
              allowedEntries = teacherSubjects.map(s => ({ subject: s, timeSlot: "No Slot Set", teacherName: userData.name }));
          }
      }

      allowedEntries.forEach(e => {
          const opt = document.createElement("option");
          opt.value = e.subject;
          opt.textContent = `${e.subject} (${e.timeSlot}) - ${e.teacherName || 'N/A'}`;
          sel.appendChild(opt);
      });
      if (ttEntries.some(e => e.subject === currentVal)) sel.value = currentVal;
  };

  ["admin-branch", "admin-sem", "admin-date"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", refreshSubjFilter);
  });


  // Add subject listener (Safety check)
  const addSubjBtn = document.getElementById("btn-add-subject");
  if (addSubjBtn) {
      const newAddSubjBtn = addSubjBtn.cloneNode(true);
      addSubjBtn.parentNode.replaceChild(newAddSubjBtn, addSubjBtn);
      newAddSubjBtn.addEventListener("click", async () => {
        const subjName = prompt("Enter new subject name:");
        if (!subjName || subjName.trim() === "") return;
        try {
          await set(ref(db, `subjects/${subjName.trim()}`), { created: Date.now() });
          showToast("Subject added successfully");
        } catch (e) {
          showToast("Error adding subject", "error");
        }
      });
  }

  // Listen for queries (Enhanced with Reply, Sorting & Notifications)
  const queriesRef = ref(db, "queries");
  onValue(queriesRef, (snapshot) => {
    const tbody = document.getElementById("admin-queries-body");
    const tabDot = document.getElementById("admin-query-notif-dot");
    const globalBadge = document.getElementById("admin-notif-badge");
    if(!tbody) return;
    tbody.innerHTML = "";
    if (snapshot.exists()) {
      const data = snapshot.val();
      const queryEntries = Object.keys(data).map(k => ({id: k, ...data[k]}));
      
      const unreplied = queryEntries.filter(q => !q.reply);
      const hasUnreplied = unreplied.length > 0;
      
      // Update Tab Dot
      hasUnreplied ? tabDot?.classList.remove("hidden") : tabDot?.classList.add("hidden");
      
      // Update Global Badge
      if (hasUnreplied) {
          if (globalBadge) {
              globalBadge.textContent = unreplied.length > 9 ? "+9" : unreplied.length;
              globalBadge.classList.remove("hidden");
          }
      } else {
          globalBadge?.classList.add("hidden");
      }

      queryEntries.sort((a,b) => b.timestamp - a.timestamp).forEach((q) => {
        const tr = document.createElement("tr");
        const hasReply = q.reply ? true : false;
        tr.innerHTML = `
            <td>${q.studentName || "Unknown"}</td>
            <td><b>${q.studentRegd || "N/A"}</b></td>
            <td><b>${q.subject}</b></td>
            <td>
                <div>${q.message}</div>
                ${hasReply ? `<div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(147, 51, 234, 0.1); border-left: 2px solid var(--primary); font-size: 0.85rem;">
                    <b>Admin:</b> ${q.reply}
                </div>` : ""}
            </td>
            <td>${new Date(q.timestamp).toLocaleString()}</td>
            <td class="text-center">
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn ${hasReply ? "secondary" : "primary"} btn-reply-query" style="padding: 0.4rem;" data-id="${q.id}" data-msg="${q.message}" data-student="${q.studentName}">
                        <span class="material-icons" style="font-size: 1.1rem;">${hasReply ? "edit" : "reply"}</span>
                    </button>
                    ${hasReply ? `
                    <button class="btn secondary btn-resolve-query" style="padding: 0.4rem; border-color: var(--danger); color: var(--danger);" title="Clear resolved query" data-id="${q.id}">
                        <span class="material-icons" style="font-size: 1.1rem;">delete_outline</span>
                    </button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">No queries found.</td></tr>';
      tabDot?.classList.add("hidden");
      globalBadge?.classList.add("hidden");
    }
  });

  // Query Reply & Resolve Logic
  document.getElementById("admin-queries-body")?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".btn-reply-query");
      if (btn) {
          const qId = btn.dataset.id;
          const qMsg = btn.dataset.msg;
          const qStudent = btn.dataset.student;
          
          document.getElementById("reply-context").innerHTML = `<b>Query from ${qStudent}:</b><br>"${qMsg}"`;
          document.getElementById("reply-modal").classList.add("active");
          document.getElementById("btn-submit-reply").dataset.currentId = qId;
          document.getElementById("reply-message").value = "";
          return;
      }

      const resolveBtn = e.target.closest(".btn-resolve-query");
      if (resolveBtn) {
          const qId = resolveBtn.dataset.id;
          if (await showConfirm("Clear Query", "Are you sure you want to clear this resolved query?")) {
              try {
                  await set(ref(db, `queries/${qId}`), null);
                  showToast("Query cleared.");
              } catch (err) {
                  showToast("Failed to clear: " + err.message, "error");
              }
          }
      }
  });

  // Query Reply Templates
  const replyModal = document.getElementById("reply-modal");
  replyModal?.addEventListener("click", (e) => {
      const templateBtn = e.target.closest(".btn-template");
      if (templateBtn) {
          const textarea = document.getElementById("reply-message");
          if (textarea) textarea.value = templateBtn.dataset.text;
      }
  });

  document.getElementById("btn-close-reply")?.addEventListener("click", () => {
      replyModal.classList.remove("active");
  });

  document.getElementById("btn-submit-reply")?.addEventListener("click", async () => {
      const submitBtn = document.getElementById("btn-submit-reply");
      const qId = submitBtn.dataset.currentId;
      const reply = document.getElementById("reply-message").value.trim();
      
      if (!reply) return showToast("Please enter a reply", "error");
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = "Sending...";
      
      try {
          await set(ref(db, `queries/${qId}/reply`), reply);
          await set(ref(db, `queries/${qId}/replyTimestamp`), Date.now());
          showToast("Reply sent successfully!");
          replyModal.classList.remove("active");
      } catch (err) {
          showToast("Failed: " + err.message, "error");
      } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="material-icons">send</span> Send Response';
      }
  });
  document
    .getElementById("btn-load-students")
    .addEventListener("click", loadRoster);
  document
    .getElementById("btn-save-attendance")
    .addEventListener("click", saveAttendance);

  // Role based form toggling
  const roleSelect = document.getElementById("admin-reg-role");
  
  if (!isAdminMaster) {
      // Teachers/HODs cannot create other HODs
      roleSelect.querySelector('option[value="hod"]')?.remove();
      // Hide roles tab for anyone except Master
      document.getElementById("tab-roles").style.display = "none";
  } else {
      // Show Roles tab for Master
      document.getElementById("tab-roles").style.display = "flex";
      
      // Add HOD option to registration if not already there
      if (!roleSelect.querySelector('option[value="hod"]')) {
          const opt = document.createElement("option");
          opt.value = "hod";
          opt.textContent = "Department HOD";
          roleSelect.appendChild(opt);
      }
  }

  // Branch Locking for HODs
  if (isHOD && userData.branch) {
      const lockSels = ["admin-branch", "admin-reg-branch", "tt-branch-select"];
      lockSels.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
              el.value = userData.branch;
              el.disabled = true;
          }
      });
  }

  // Initialize HOD-only Managers only once
  if (isAdminMaster && !window.hodManagersInitialized) {
      initRoleManagement();
      initTimetableManagement();
      window.hodManagersInitialized = true;
  }

  // Populate All Branch Dropdowns (Attendance, Register, Timetable, Subjects)
  const branchSels = [
    document.getElementById("admin-branch"),
    document.getElementById("admin-reg-branch"),
    document.getElementById("tt-branch-select"),
    document.getElementById("roles-subject-branch-select")
  ];

  onValue(ref(db, "roles/branches"), (snap) => {
      const html = '<option value="" disabled selected>Select Branch</option>';
      branchSels.forEach(sel => {
          if(!sel) return;
          sel.innerHTML = html;
          if (snap.exists()) {
              Object.keys(snap.val()).forEach(b => {
                  const opt = document.createElement("option");
                  opt.value = opt.textContent = b;
                  sel.appendChild(opt);
              });
          }
      });
  });

  roleSelect.addEventListener("change", (e) => {
    if (e.target.value === "admin") {
        fieldSubjects.classList.remove("hidden");
    } else {
        fieldSubjects.classList.add("hidden");
    }
  });

  // --- ADMIN: Create Account Logic ---
  const adminRegForm = document.getElementById("admin-register-form");
  if (adminRegForm) {
    adminRegForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-admin-register");
      btn.disabled = true;
      btn.innerHTML = 'Creating... <span class="material-icons">hourglass_empty</span>';
      
      try {
        const role = document.getElementById("admin-reg-role").value;
        const regdNo = document.getElementById("admin-reg-regd").value.trim().toUpperCase();
        const rawName = document.getElementById("admin-reg-name").value.trim();
        const name = formatTitleCase(rawName);
        const email = document.getElementById("admin-reg-email").value.trim();
        const branch = document.getElementById("admin-reg-branch").value.trim();
        const sem = document.getElementById("admin-reg-sem").value.trim();
        const rawPassword = document.getElementById("admin-reg-password").value;
        const password = rawPassword || "123456";

        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newUid = cred.user.uid;

        const userDataToSave = {
          name: name,
          email: email,
          role: role,
          branch: branch,
          sem: sem,
          createdAt: Date.now(),
          regdNo: regdNo,
          status: "active"
        };

        if (role === "admin") {
            const subjectsInput = document.getElementById("admin-reg-subjects");
            const subjectsVal = subjectsInput ? subjectsInput.value : "";
            userDataToSave.subjects = subjectsVal.split(",").map(s => s.trim()).filter(s => s !== "");
        }

        await set(ref(db, `users/${newUid}`), userDataToSave);
        await set(ref(db, `regd_to_email/${regdNo}`), email);
        
        // Instant Reset Email for the user
        try {
           await sendPasswordResetEmail(auth, email);
        } catch (mailErr) {
           console.warn("Reset email failed but account created", mailErr);
        }

        await signOut(secondaryAuth);

        showToast(`Account for ${name} created successfully!`);
        adminRegForm.reset();
      } catch (err) {
        if (errorEl) errorEl.textContent = err.message;
        showToast("Creation failed: " + err.message, "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons">person_add</span> Create Selected Account';
      }
    });
  }
}

// Role Management Logic (HOD)
function initRoleManagement() {
    const listBranches = document.getElementById("roles-branch-list");
    const listBatches = document.getElementById("roles-batch-list");
    const listSubjects = document.getElementById("roles-subject-list");

    onValue(ref(db, "roles/branches"), snap => {
        listBranches.innerHTML = "";
        if (snap.exists()) {
            Object.keys(snap.val()).forEach(b => {
                const li = document.createElement("li");
                li.className = "role-item-display";
                li.style.cssText = "padding: 0.5rem; background: rgba(255,255,255,0.05); margin-bottom:0.4rem; border-radius:6px; display:flex; justify-content:space-between; align-items:center;";
                li.innerHTML = `
                  <span>${b}</span>
                  <button class="btn icon-btn btn-delete-branch" data-branch="${b}">
                    <span class="material-icons" style="color:var(--danger); font-size:1.1rem;">delete</span>
                  </button>
                `;
                listBranches.appendChild(li);
            });
        }
    });

    // Event Delegation for Branch Deletion
    listBranches.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-delete-branch");
        if (btn) {
            const b = btn.dataset.branch;
            if (await showConfirm("Delete Branch", `Are you sure you want to delete branch '${b}'? This will remove all associated subjects and timetables.`)) {
                try {
                    await set(ref(db, `roles/branches/${b}`), null);
                    showToast(`Branch ${b} removed.`);
                } catch (err) {
                    showToast("Failed to delete branch", "error");
                }
            }
        }
    });

    onValue(ref(db, "subjects"), snap => {
        listSubjects.innerHTML = "";
        if (snap.exists()) {
            const data = snap.val();
            Object.keys(data).forEach(branchName => {
                const branchObj = data[branchName];
                
                // Handle Branch -> Sem -> Subject nested structure
                Object.keys(branchObj).forEach(semOrSubj => {
                    const item = branchObj[semOrSubj];
                    
                    if (item.created) {
                        // Legacy single-level subject: subjects/branch/subj
                        const li = document.createElement("li");
                        li.className = "role-item-display";
                        li.style.cssText = "padding: 0.5rem; background: rgba(255,255,255,0.05); margin-bottom:0.4rem; border-radius:6px; display:flex; justify-content:space-between; align-items:center;";
                        li.innerHTML = `
                            <span><b>${semOrSubj}</b> <small style="color:var(--primary)">(${branchName})</small></span>
                            <button class="btn icon-btn btn-delete-subject" data-path="subjects/${branchName}/${semOrSubj}">
                                <span class="material-icons" style="color:var(--danger); font-size:1.1rem;">delete</span>
                            </button>
                        `;
                        listSubjects.appendChild(li);
                    } else {
                        // Structured: subjects/branch/sem/subj
                        Object.keys(item).forEach(subjectName => {
                            const li = document.createElement("li");
                            li.className = "role-item-display";
                            li.style.cssText = "padding: 0.5rem; background: rgba(255,255,255,0.05); margin-bottom:0.4rem; border-radius:6px; display:flex; justify-content:space-between; align-items:center;";
                            li.innerHTML = `
                                <span><b>${subjectName}</b> <small style="color:var(--primary)">(${branchName} - Sem ${semOrSubj})</small></span>
                                <button class="btn icon-btn btn-delete-subject" data-path="subjects/${branchName}/${semOrSubj}/${subjectName}">
                                    <span class="material-icons" style="color:var(--danger); font-size:1.1rem;">delete</span>
                                </button>
                            `;
                            listSubjects.appendChild(li);
                        });
                    }
                });
            });
        }
    });

    // Event Delegation for Subject Deletion
    listSubjects.addEventListener("click", async (e) => {
        const deleteBtn = e.target.closest(".btn-delete-subject");
        if (deleteBtn) {
            const path = deleteBtn.dataset.path;
            if (await showConfirm("Remove Subject", "Are you sure you want to remove this subject?")) {
                try {
                    await set(ref(db, path), null);
                    showToast("Subject removed.");
                } catch (err) {
                    showToast("Failed to delete subject", "error");
                }
            }
            return;
        }
    });

    document.getElementById("btn-add-branch")?.addEventListener("click", async () => {
        const val = document.getElementById("new-branch-input").value.trim().toUpperCase();
        if(!val) return;
        await set(ref(db, `roles/branches/${val}`), true);
        document.getElementById("new-branch-input").value = "";
        showToast(`Branch ${val} added.`);
    });

    document.getElementById("btn-roles-add-subject")?.addEventListener("click", async () => {
        const branch = document.getElementById("roles-subject-branch-select").value;
        const sem = document.getElementById("roles-subject-sem-select").value;
        const val = document.getElementById("roles-new-subject-input").value.trim();
        if(!branch || !sem || !val) {
            showToast("Select Branch, Semester and Enter Subject", "error");
            return;
        }
        await set(ref(db, `subjects/${branch}/${sem}/${val}`), { created: Date.now() });
        document.getElementById("roles-new-subject-input").value = "";
        showToast(`Subject ${val} added to ${branch} (Sem ${sem}).`);
    });
}

// Timetable Management (HOD)
function initTimetableManagement() {
    const branchSel = document.getElementById("tt-branch-select");
    const semSel = document.getElementById("tt-sem-select");
    const previewBody = document.getElementById("tt-preview-body");

    const refreshPreview = async () => {
        const branch = branchSel.value;
        const sem = semSel.value;
        if(!branch || !sem) {
            previewBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Select Branch & Semester to view preview</td></tr>';
            return;
        }

        const ttRef = ref(db, `timetable/${branch}/${sem}`);
        const snap = await get(ttRef);
        
        previewBody.innerHTML = "";
        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const data = snap.exists() ? snap.val() : {};

        days.forEach(day => {
            const dayEntries = data[day] || {};
            const entryIds = Object.keys(dayEntries);

            if (entryIds.length === 0) {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td style="font-weight:600; color:var(--primary);">${day}</td><td colspan="4" class="text-muted">No classes</td>`;
                previewBody.appendChild(tr);
            } else {
                entryIds.forEach((id, idx) => {
                    const entry = dayEntries[id];
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        ${idx === 0 ? `<td rowspan="${entryIds.length}" style="font-weight:600; color:var(--primary);">${day}</td>` : ""}
                        <td>${entry.timeSlot || "N/A"}</td>
                        <td><b>${entry.subject}</b></td>
                        <td>${entry.teacherName || "Not Assigned"}</td>
                        <td class="text-center">
                            <button class="btn icon-btn btn-delete-tt" data-path="timetable/${branch}/${sem}/${day}/${id}">
                                <span class="material-icons" style="color:var(--danger); font-size:1.2rem;">delete</span>
                            </button>
                        </td>
                    `;
                    previewBody.appendChild(tr);
                });
            }
        });
    };

    // Populate Subjects Dropdown based on Branch
    const refreshTtSubjDropdown = async () => {
        const branch = branchSel.value;
        const sem = semSel.value;
        const subjSel = document.getElementById("tt-subject-select");
        if(!branch || !sem || !subjSel) return;

        const snap = await get(ref(db, `subjects/${branch}/${sem}`));
        subjSel.innerHTML = '<option value="" disabled selected>Select Subject</option>';
        if(snap.exists()) {
            Object.keys(snap.val()).forEach(s => {
                const opt = document.createElement("option");
                opt.value = opt.textContent = s;
                subjSel.appendChild(opt);
            });
        } else {
            subjSel.innerHTML = '<option value="" disabled selected>No subjects for this (Branch/Sem)</option>';
        }
    };

    branchSel.addEventListener("change", () => {
        refreshPreview();
        refreshTtSubjDropdown();
    });
    semSel.addEventListener("change", () => {
        refreshPreview();
        refreshTtSubjDropdown();
    });

    // Event Delegation for Deletion
    previewBody.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-delete-tt");
        if (btn) {
            const path = btn.dataset.path;
            if (await showConfirm("Delete Timetable Slot", "Are you sure you want to delete this timetable slot?")) {
                try {
                    await set(ref(db, path), null); // Delete
                    showToast("Slot deleted");
                    refreshPreview();
                } catch (err) {
                    showToast("Failed to delete", "error");
                }
            }
        }
    });

    document.getElementById("btn-add-tt-subject")?.addEventListener("click", async () => {
        const branch = branchSel.value;
        const sem = semSel.value;
        const day = document.getElementById("tt-day-select").value;
        const subject = document.getElementById("tt-subject-select").value;
        const teacherName = document.getElementById("tt-teacher-input").value.trim();
        const fromTime = document.getElementById("timetable-from").value;
        const toTime = document.getElementById("timetable-to").value;

        if(!branch || !sem || !subject || !fromTime || !toTime || !teacherName) {
            showToast("Complete all fields", "error");
            return;
        }

        // Format time to 2pm-3:30pm style
        const formatTime = (t) => {
            let [h, m] = t.split(":");
            h = parseInt(h);
            const ampm = h >= 12 ? "pm" : "am";
            h = h % 12 || 12;
            return `${h}${m === "00" ? "" : ":" + m}${ampm}`;
        };
        const timeSlot = `${formatTime(fromTime)} - ${formatTime(toTime)}`;

        try {
            // Add unique entry
            const ttPath = `timetable/${branch}/${sem}/${day}`;
            const newTtRef = push(ref(db, ttPath));
            await set(newTtRef, { 
                subject, 
                teacherName,
                timeSlot,
                createdAt: Date.now()
            });
            
            document.getElementById("tt-teacher-input").value = "";
            showToast(`Task Added: ${subject} by ${teacherName}`);
            refreshPreview();
        } catch (err) {
            showToast("Failed to add: " + err.message, "error");
        }
    });
}



async function loadLeaderboard() {
    const tbody = document.getElementById("leaderboard-body");
    const branchFilter = document.getElementById("leaderboard-branch-filter").value;
    const semFilter = document.getElementById("leaderboard-sem-filter").value;
    const subjectFilter = document.getElementById("leaderboard-subject-filter").value;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Calculating...</td></tr>';

    try {
        const usersSnap = await get(ref(db, "users"));
        const attSnap = await get(ref(db, "attendance"));
        
        if (!usersSnap.exists()) return;
        const users = usersSnap.val();
        const attendance = attSnap.exists() ? attSnap.val() : {};

        const students = Object.keys(users)
            .filter(studentUid => {
                const s = users[studentUid];
                if (s.role !== "student") return false;
                
                // Advanced Filters
                if (branchFilter !== "all" && s.branch !== branchFilter) return false;
                if (semFilter !== "all" && s.sem != semFilter) return false;

                // Admin/Master visibility rules
                if (!isAdminMaster && currentAdminData && currentAdminData.branch) {
                    return s.branch === currentAdminData.branch;
                }
                return true;
            })
            .map(uid => ({
                uid,
                name: users[uid].name,
                regd: users[uid].regdNo,
                branch: users[uid].branch || "N/A",
                sem: users[uid].sem || "N/A"
            }));

        const leaderboardData = students.map(student => {
            let totalHeld = 0;
            let totalAttended = 0;

            Object.keys(attendance).forEach(date => {
                const dailyAtt = attendance[date];
                if (dailyAtt && typeof dailyAtt === 'object') {
                    Object.keys(dailyAtt).forEach(subject => {
                        // If subject filter is set, only skip if it doesn't match
                        if (subjectFilter !== "overall" && subject !== subjectFilter) return;

                        const records = dailyAtt[subject];
                        if (records && records[student.uid] !== undefined) {
                          totalHeld++;
                          if (records[student.uid] === "present") totalAttended++;
                        }
                    });
                }
            });

            const percentage = totalHeld > 0 ? ((totalAttended / totalHeld) * 100) : 0;
            return { ...student, percentage };
        });

        leaderboardData.sort((a, b) => b.percentage - a.percentage);

        tbody.innerHTML = "";
        if (leaderboardData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No students found for this selection.</td></tr>';
        } else {
            leaderboardData.forEach((student, index) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><b>#${index + 1}</b></td>
                    <td>${student.name}</td>
                    <td>${student.regd}</td>
                    <td>${student.branch}</td>
                    <td><span class="stat-value" style="font-size: 1.1rem; color: ${student.percentage >= 75 ? "var(--success)" : "var(--danger)"}">${student.percentage.toFixed(1)}%</span></td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        showToast("Leaderboard error", "error");
    }
}

// Attach Leaderboard listeners
["leaderboard-branch-filter", "leaderboard-sem-filter", "leaderboard-subject-filter"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", loadLeaderboard);
});

async function loadRoster() {
  const date = document.getElementById("admin-date").value;
  const subject = document.getElementById("admin-subject").value;
  const branch = document.getElementById("admin-branch").value;
  const sem = document.getElementById("admin-sem").value;

  if (!date || !subject || !branch || !sem) {
      return showToast("Please select Branch, Semester, Subject and Date", "error");
  }

  const btn = document.getElementById("btn-load-students");
  btn.innerHTML = "Loading...";

  try {
    const snapshot = await get(ref(db, "users"));
    if (!snapshot.exists()) {
      showToast("No students found.", "error");
      btn.innerHTML = '<span class="material-icons">people</span> Load Student Roster';
      return;
    }

    const users = snapshot.val();
    // Filter students by branch and semester
    const students = Object.keys(users)
      .filter((uid) => {
          const u = users[uid];
          const isStudent = u.role === "student";
          const matchesBranch = u.branch === branch;
          const matchesSem = u.sem == sem;
          
          let authorized = isStudent && matchesBranch && matchesSem;
          
          // If NOT Master, must match admin's own branch
          if (!isAdminMaster && currentAdminData && u.branch !== currentAdminData.branch) {
              authorized = false;
          }
          return authorized;
      })
      .map((uid) => ({ uid, ...users[uid] }));

    currentAdminStudents = students;

    const attendanceSnap = await get(ref(db, `attendance/${date}/${subject}`));
    const existingAtt = attendanceSnap.exists() ? attendanceSnap.val() : {};

    const tbody = document.getElementById("admin-roster-body");
    tbody.innerHTML = "";

    if (currentAdminStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No students found for this Branch/Batch.</td></tr>';
    }

    currentAdminStudents.forEach((student) => {
      const status = existingAtt[student.uid] || "absent";
      const isSuspended = student.status === "suspended";

      const tr = document.createElement("tr");
      let attendanceHTML = `
            <div class="switch-wrapper">
                <input type="radio" name="att-${student.uid}" id="pres-${student.uid}" value="present" class="status-radio present" ${status === "present" ? "checked" : ""}>
                <label for="pres-${student.uid}" class="status-label desktop-only">Present</label>
                
                <input type="radio" name="att-${student.uid}" id="abs-${student.uid}" value="absent" class="status-radio absent" ${status === "absent" ? "checked" : ""}>
                <label for="abs-${student.uid}" class="status-label desktop-only">Absent</label>

                <button type="button" class="att-toggle-pill ${status === 'present' ? 'is-present' : 'is-absent'}" 
                    data-uid="${student.uid}"
                    data-status="${status}">
                    ${status === 'present' ? 'Present' : 'Absent'}
                </button>
            </div>
      `;

      if (isSuspended) {
          attendanceHTML = `<span style="color: var(--danger); font-weight: 600;">Suspended</span>`;
      }

      tr.innerHTML = `
                <td><b>${student.name}</b></td>
                <td>${student.regdNo || "N/A"}</td>
                <td class="text-center">
                    ${attendanceHTML}
                </td>
                <td class="text-center">
                    <div class="action-menu-container">
                        <button class="btn-more" title="More Actions">
                            <span class="material-icons">more_vert</span>
                        </button>
                        <div class="action-dropdown">
                            <button class="menu-item btn-reset-pwd" data-email="${student.email}">
                                <span class="material-icons">lock_reset</span> Reset Password
                            </button>
                            <button class="menu-item btn-toggle-suspend ${isSuspended ? "success" : "danger"}" data-uid="${student.uid}" data-status="${student.status}">
                                <span class="material-icons">${isSuspended ? "check_circle" : "block"}</span> 
                                ${isSuspended ? "Activate Account" : "Suspend Account"}
                            </button>
                        </div>
                    </div>
                </td>
            `;
      tbody.appendChild(tr);
    });

    document.getElementById("admin-roster-container").classList.remove("hidden");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    btn.innerHTML = '<span class="material-icons">people</span> Load Student Roster';
  }
}


// Toggle Actions Dropdown + Attendance Toggle Pill
document.addEventListener("click", (e) => {

    // --- Mobile Attendance Toggle Pill ---
    const pill = e.target.closest(".att-toggle-pill");
    if (pill) {
        const uid = pill.dataset.uid;
        const currentStatus = pill.dataset.status;
        const newStatus = currentStatus === "present" ? "absent" : "present";

        // Update the hidden radio
        const radio = document.getElementById(newStatus === "present" ? `pres-${uid}` : `abs-${uid}`);
        if (radio) radio.checked = true;

        // Update pill appearance
        pill.dataset.status = newStatus;
        pill.textContent = newStatus === "present" ? "Present" : "Absent";
        pill.classList.toggle("is-present", newStatus === "present");
        pill.classList.toggle("is-absent", newStatus === "absent");
        return;
    }

    const moreBtn = e.target.closest(".btn-more");
    const allDropdowns = document.querySelectorAll(".action-dropdown");
    
    if (moreBtn) {
        const dropdown = moreBtn.parentElement.querySelector(".action-dropdown");
        const isOpen = dropdown.classList.contains("active");
        
        allDropdowns.forEach(d => d.classList.remove("active"));
        if (!isOpen) dropdown.classList.add("active");
        return;
    }
    
    // Close if click outside
    if (!e.target.closest(".action-menu-container")) {
        allDropdowns.forEach(d => d.classList.remove("active"));
    }
});

// Delegate actions (Reset Password / Suspend)
document.getElementById("admin-roster-body").addEventListener("click", async (e) => {
    // Handling Reset Password
    const resetBtn = e.target.closest(".btn-reset-pwd");
    if (resetBtn) {
        const email = resetBtn.dataset.email;
        if (await showConfirm("Reset Password", `Send password reset email to ${email}?`)) {
            try {
                await sendPasswordResetEmail(auth, email);
                showToast(`Password reset email sent to ${email}`);
            } catch (error) {
                showToast("Error: " + error.message, "error");
            }
        }
        return;
    }

    // Handling Suspend Toggle
    const suspendBtn = e.target.closest(".btn-toggle-suspend");
    if (suspendBtn) {
        const uid = suspendBtn.dataset.uid;
        const currentStatus = suspendBtn.dataset.status;
        const newStatus = currentStatus === "suspended" ? "active" : "suspended";
        const actionWord = currentStatus === "suspended" ? "Activate" : "Suspend";
        
        if (await showConfirm(`${actionWord} Account`, `Are you sure you want to ${actionWord} this account?`)) {
            try {
                await set(ref(db, `users/${uid}/status`), newStatus);
                showToast(`Account successfully ${newStatus}.`);
                loadRoster(); // Refresh the list
            } catch (err) {
                showToast(`Failed to update status: ${err.message}`, "error");
            }
        }
    }
});

async function saveAttendance() {
  const date = document.getElementById("admin-date").value;
  const subject = document.getElementById("admin-subject").value;
  const attendanceData = {};

  currentAdminStudents.forEach((student) => {
    const selected = document.querySelector(
      `input[name="att-${student.uid}"]:checked`,
    );
    if (selected) {
      attendanceData[student.uid] = selected.value;
    }
  });

  const branch = document.getElementById("admin-branch").value;
  const sem = document.getElementById("admin-sem").value;
  
  if (!date || !subject || !branch || !sem) {
    showToast("Please fill all details", "error");
    return;
  }

  try {
    await set(ref(db, `attendance/${branch}/${sem}/${date}/${subject}`), attendanceData);
    showToast("Attendance saved successfully!");
  } catch (error) {
    showToast("Failed to save: " + error.message, "error");
  }
}

// --- Global: Password Visibility Toggle ---
document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".toggle-password");
    if (toggle) {
        const input = toggle.parentElement.querySelector("input");
        if (input) {
            const isPass = input.type === "password";
            input.type = isPass ? "text" : "password";
            toggle.textContent = isPass ? "visibility_off" : "visibility";
        }
    }
});
