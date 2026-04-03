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

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const dbRef = ref(db);
    try {
      const snapshot = await get(child(dbRef, `users/${user.uid}`));
      if (snapshot.exists()) {
        const userData = snapshot.val();
        currentAdminData = userData;
        
        // Master Admin Check: aditrimitra@gmail.com OR role is master
        isAdminMaster = (user.email === "aditrimitra@gmail.com" || userData.role === "master");
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

// Hamburger Menu Toggle
const hamburger = document.getElementById("hamburger-menu");
const mobileMenu = document.getElementById("mobile-menu");
if (hamburger && mobileMenu) {
    hamburger.addEventListener("click", () => {
        hamburger.classList.toggle("open");
        mobileMenu.classList.toggle("active");
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

document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        const targetTab = tab.dataset.tab;
        
        // Update nav buttons
        document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        // Update panels
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        document.getElementById(targetTab).classList.add("active");

        if (targetTab === "leaderboard-view") {
            loadLeaderboard();
        }
    });
});

// --- ADMIN DASHBOARD ---
function initAdminDashboard(user, userData) {
  currentAdminData = userData;
  const adminNameStr = isAdminMaster ? `${userData.name} (HOD)` : `${userData.name} (Teacher)`;
  document.getElementById("admin-name-display-desktop").textContent = adminNameStr;
  document.getElementById("admin-name-display-mobile").textContent = adminNameStr;

  // Set default date to today
  document.getElementById("admin-date").valueAsDate = new Date();

  // Listen for subjects
  const subjectsRef = ref(db, "subjects");
  onValue(subjectsRef, async (snap) => {
    const sel = document.getElementById("admin-subject");
    const oldVal = sel.value;
    sel.innerHTML = '<option value="" disabled selected>Select Subject</option>';
    
    if (snap.exists()) {
      const allSubjectsInBase = snapshotToObj(snap); // Helper to get keys
      let subjectsToShow = Object.keys(allSubjectsInBase);

      // Filtering logic by Timetable and Role will be handled in refreshSubjFilter
      if (!isAdminMaster && userData.subjects) {
          subjectsToShow = subjectsToShow.filter(s => userData.subjects.includes(s));
      }

      if (subjectsToShow.length > 0) {
          subjectsToShow.forEach(s => {
            const opt = document.createElement("option");
            opt.value = opt.textContent = s;
            sel.appendChild(opt);
          });
      }
    }
    if (sel.querySelector(`option[value="${oldVal}"]`)) sel.value = oldVal;
  });

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
          allowedEntries = ttEntries.length > 0 ? ttEntries : [{ subject: "Generic Class", timeSlot: "Anytime", teacherName: "Admin" }];
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

  // Listen for queries (Safety check)
  const queriesRef = ref(db, "queries");
  onValue(queriesRef, (snapshot) => {
    const tbody = document.getElementById("admin-queries-body");
    if(!tbody) return;
    tbody.innerHTML = "";
    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.values(data).forEach((q) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
                    <td>${q.studentName || "Unknown"}</td>
                    <td><b>${q.studentRegd || "N/A"}</b></td>
                    <td><b>${q.subject}</b></td>
                    <td>${q.message}</td>
                    <td>${new Date(q.timestamp).toLocaleString()}</td>
                `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center">No queries found.</td></tr>';
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
      
      const role = document.getElementById("admin-reg-role").value;
      const regdNo = document.getElementById("admin-reg-regd").value.trim();
      const name = document.getElementById("admin-reg-name").value;
      const email = document.getElementById("admin-reg-email").value.trim();
      const branch = document.getElementById("admin-reg-branch").value.trim();
      const sem = document.getElementById("admin-reg-sem").value.trim();
      const password = document.getElementById("admin-reg-password").value;
      
      let subjects = "";
      if (role === 'admin') {
         subjects = document.getElementById("admin-reg-subjects").value.trim();
      }
      const errorEl = document.getElementById("admin-reg-error");
      
      btn.disabled = true;
      btn.innerHTML = '<span class="material-icons">hourglass_empty</span> Creating...';
      errorEl.textContent = "";

      try {
        if (!branch || !sem) throw new Error("Branch and Semester must be selected.");

        const mappingRef = ref(db, `regd_to_email/${regdNo}`);
        const mappingSnap = await get(mappingRef);
        if (mappingSnap.exists()) {
            throw new Error(`ID '${regdNo}' is already taken.`);
        }

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
            userDataToSave.subjects = subjects.split(",").map(s => s.trim()).filter(s => s !== "");
        }

        await set(ref(db, `users/${newUid}`), userDataToSave);
        await set(mappingRef, email);
        await signOut(secondaryAuth);

        showToast(`Account for ${name} created successfully!`);
        adminRegForm.reset();
      } catch (err) {
        errorEl.textContent = err.message;
        showToast("Creation failed", "error");
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
            Object.keys(data).forEach(key => {
                const item = data[key];
                
                // If the item itself has 'created', it's a legacy flat subject
                if (item.created) {
                    const li = document.createElement("li");
                    li.className = "role-item-display";
                    li.style.cssText = "padding: 0.5rem; background: rgba(255,255,255,0.05); margin-bottom:0.4rem; border-radius:6px; display:flex; justify-content:space-between; align-items:center;";
                    li.innerHTML = `
                        <span><b>${key}</b> <small class="text-muted">(Legacy)</small></span>
                        <button class="btn icon-btn btn-delete-subject" data-path="subjects/${key}">
                            <span class="material-icons" style="color:var(--danger); font-size:1.1rem;">delete</span>
                        </button>
                    `;
                    listSubjects.appendChild(li);
                } else {
                    // It's a branch container
                    Object.keys(item).forEach(subjName => {
                        const li = document.createElement("li");
                        li.className = "role-item-display";
                        li.style.cssText = "padding: 0.5rem; background: rgba(255,255,255,0.05); margin-bottom:0.4rem; border-radius:6px; display:flex; justify-content:space-between; align-items:center;";
                        li.innerHTML = `
                            <span><b>${subjName}</b> <small style="color:var(--primary)">(${key})</small></span>
                            <button class="btn icon-btn btn-delete-subject" data-path="subjects/${key}/${subjName}">
                                <span class="material-icons" style="color:var(--danger); font-size:1.1rem;">delete</span>
                            </button>
                        `;
                        listSubjects.appendChild(li);
                    });
                }
            });
        }
    });

    // Event Delegation for Subject Deletion
    listSubjects.addEventListener("click", async (e) => {
        const btn = e.target.closest(".btn-delete-subject");
        if (btn) {
            const path = btn.dataset.path;
            if (await showConfirm("Remove Subject", "Are you sure you want to remove this subject from the global list?")) {
                try {
                    await set(ref(db, path), null);
                    showToast("Subject removed.");
                } catch (err) {
                    showToast("Failed to delete subject", "error");
                }
            }
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
        const val = document.getElementById("roles-new-subject-input").value.trim();
        if(!branch || !val) {
            showToast("Select Branch and Enter Subject", "error");
            return;
        }
        await set(ref(db, `subjects/${branch}/${val}`), { created: Date.now() });
        document.getElementById("roles-new-subject-input").value = "";
        showToast(`Subject ${val} added to ${branch}.`);
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
        const subjSel = document.getElementById("tt-subject-select");
        if(!branch || !subjSel) return;

        const snap = await get(ref(db, `subjects/${branch}`));
        subjSel.innerHTML = '<option value="" disabled selected>Select Subject</option>';
        if(snap.exists()) {
            Object.keys(snap.val()).forEach(s => {
                const opt = document.createElement("option");
                opt.value = opt.textContent = s;
                subjSel.appendChild(opt);
            });
        } else {
            subjSel.innerHTML = '<option value="" disabled selected>No subjects for this branch</option>';
        }
    };

    branchSel.addEventListener("change", () => {
        refreshPreview();
        refreshTtSubjDropdown();
    });
    semSel.addEventListener("change", refreshPreview);

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
        const timeSlot = document.getElementById("tt-time-select").value;

        if(!branch || !sem || !subject || !timeSlot || !teacherName) {
            showToast("Complete all fields", "error");
            return;
        }

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
                const matchesRole = s.role === "student";
                // Filter by HOD branch if applicable
                if (!isAdminMaster && currentAdminData && currentAdminData.branch) {
                    return matchesRole && s.branch === currentAdminData.branch;
                }
                return matchesRole;
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

            Object.values(attendance).forEach(subjDates => {
                Object.values(subjDates).forEach(records => {
                    totalHeld++;
                    if (records[student.uid] === "present") {
                        totalAttended++;
                    }
                });
            });

            const percentage = totalHeld > 0 ? ((totalAttended / totalHeld) * 100) : 0;
            return { ...student, percentage };
        });

        leaderboardData.sort((a, b) => b.percentage - a.percentage);

        tbody.innerHTML = "";
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
    } catch (e) {
        showToast("Leaderboard error", "error");
    }
}

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
      return;
    }

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
                <label for="pres-${student.uid}" class="status-label">Present</label>
                
                <input type="radio" name="att-${student.uid}" id="abs-${student.uid}" value="absent" class="status-radio absent" ${status === "absent" ? "checked" : ""}>
                <label for="abs-${student.uid}" class="status-label">Absent</label>
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
                <td class="text-center" style="display:flex; gap:0.5rem; justify-content:center;">
                    <button class="btn icon-btn btn-reset-pwd" data-email="${student.email}" title="Reset Password">
                        <span class="material-icons">lock_reset</span>
                    </button>
                    <button class="btn icon-btn btn-toggle-suspend" data-uid="${student.uid}" data-status="${student.status}" title="${isSuspended ? "Activate Account" : "Suspend Account"}">
                        <span class="material-icons" style="color: ${isSuspended ? "var(--success)" : "var(--danger)"}">${isSuspended ? "check_circle" : "block"}</span>
                    </button>
                </td>
            `;
      tbody.appendChild(tr);
    });

    document.getElementById("admin-roster-container").classList.remove("hidden");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    btn.innerHTML = '<span class="material-icons">people</span> Load Roster';
  }
}


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

  try {
    await set(ref(db, `attendance/${date}/${subject}`), attendanceData);
    showToast("Attendance saved successfully!");
  } catch (error) {
    showToast("Failed to save: " + error.message, "error");
  }
}
