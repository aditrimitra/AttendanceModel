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

  // Re-run filter when date/branch/batch changes
  const refreshSubjFilter = async () => {
      const branch = document.getElementById("admin-branch")?.value;
      const batch = document.getElementById("admin-batch")?.value;
      const date = document.getElementById("admin-date")?.value;
      
      const sel = document.getElementById("admin-subject");
      if(!branch || !batch || !date) {
          sel.innerHTML = '<option value="" disabled selected>Select Branch/Batch/Date First</option>';
          return;
      }

      const dateObj = new Date(date);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const ttSnap = await get(ref(db, `timetable/${branch}/${batch}/${dayName}`));
      const ttSubjects = ttSnap.exists() ? Object.keys(ttSnap.val()) : [];

      const currentVal = sel.value;
      sel.innerHTML = '<option value="" disabled selected>Select Subject</option>';

      let allowed = [];
      if (isAdminMaster) {
          // HOD gets timetable or fallback
          allowed = ttSubjects.length > 0 ? ttSubjects : ["Generic Class"];
      } else {
          // Teacher gets intersection of their subjects and timetable
          const teacherSubjects = userData.subjects || [];
          allowed = ttSubjects.length > 0 ? teacherSubjects.filter(s => ttSubjects.includes(s)) : teacherSubjects;
      }

      allowed.forEach(s => {
          const opt = document.createElement("option");
          opt.value = opt.textContent = s;
          sel.appendChild(opt);
      });
      if (allowed.includes(currentVal)) sel.value = currentVal;
  };

  ["admin-branch", "admin-batch", "admin-date"].forEach(id => {
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
      // Also lock batch if teacher? (User didn't specify, so leaving batch free for now)
  }

  // Initialize HOD-only Managers only once
  if (isAdminMaster && !window.hodManagersInitialized) {
      initRoleManagement();
      initTimetableManagement();
      window.hodManagersInitialized = true;
  }

  // Populate All Branch/Batch Dropdowns (Attendance, Register, Timetable)
  const branchSels = [
    document.getElementById("admin-branch"),
    document.getElementById("admin-reg-branch"),
    document.getElementById("tt-branch-select")
  ];
  const batchSels = [
    document.getElementById("admin-batch"),
    document.getElementById("admin-reg-batch"),
    document.getElementById("tt-batch-select")
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

  onValue(ref(db, "roles/batches"), (snap) => {
      const html = '<option value="" disabled selected>Select Batch</option>';
      batchSels.forEach(sel => {
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
      const batch = document.getElementById("admin-reg-batch").value.trim();
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
        if (!branch || !batch) throw new Error("Branch and Batch must be selected.");

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
          batch: batch,
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
                li.innerHTML = `<span>${b}</span>`;
                listBranches.appendChild(li);
            });
        }
    });

    onValue(ref(db, "roles/batches"), snap => {
        listBatches.innerHTML = "";
        if (snap.exists()) {
            Object.keys(snap.val()).forEach(b => {
                const li = document.createElement("li");
                li.className = "role-item-display";
                li.style.cssText = "padding: 0.5rem; background: rgba(255,255,255,0.05); margin-bottom:0.4rem; border-radius:6px; display:flex; justify-content:space-between; align-items:center;";
                li.innerHTML = `<span>${b}</span>`;
                listBatches.appendChild(li);
            });
        }
    });

    onValue(ref(db, "subjects"), snap => {
        listSubjects.innerHTML = "";
        if (snap.exists()) {
            Object.keys(snap.val()).forEach(s => {
                const li = document.createElement("li");
                li.className = "role-item-display";
                li.style.cssText = "padding: 0.5rem; background: rgba(255,255,255,0.05); margin-bottom:0.4rem; border-radius:6px;";
                li.textContent = s;
                listSubjects.appendChild(li);
            });
        }
    });

    document.getElementById("btn-add-branch")?.addEventListener("click", async () => {
        const val = document.getElementById("new-branch-input").value.trim().toUpperCase();
        if(!val) return;
        await set(ref(db, `roles/branches/${val}`), true);
        document.getElementById("new-branch-input").value = "";
        showToast(`Branch ${val} added.`);
    });

    document.getElementById("btn-add-batch")?.addEventListener("click", async () => {
        const val = document.getElementById("new-batch-input").value.trim();
        if(!val) return;
        await set(ref(db, `roles/batches/${val}`), true);
        document.getElementById("new-batch-input").value = "";
        showToast(`Batch ${val} added.`);
    });

    document.getElementById("btn-roles-add-subject")?.addEventListener("click", async () => {
        const val = document.getElementById("roles-new-subject-input").value.trim();
        if(!val) return;
        await set(ref(db, `subjects/${val}`), { created: Date.now() });
        document.getElementById("roles-new-subject-input").value = "";
        showToast(`Subject ${val} added to global list.`);
    });
}

// Timetable Management (HOD)
function initTimetableManagement() {
    const branchSel = document.getElementById("tt-branch-select");
    const batchSel = document.getElementById("tt-batch-select");
    const previewBody = document.getElementById("tt-preview-body");

    const refreshPreview = async () => {
        const branch = branchSel.value;
        const batch = batchSel.value;
        if(!branch || !batch) {
            previewBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">Select Branch & Batch to view preview</td></tr>';
            return;
        }

        const ttRef = ref(db, `timetable/${branch}/${batch}`);
        const snap = await get(ttRef);
        
        previewBody.innerHTML = "";
        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        
        days.forEach(day => {
            const tr = document.createElement("tr");
            const subjects = (snap.exists() && snap.val()[day]) ? Object.keys(snap.val()[day]).join(", ") : '<span class="text-muted">No classes</span>';
            tr.innerHTML = `<td style="font-weight:600; color:var(--primary);">${day}</td><td>${subjects}</td>`;
            previewBody.appendChild(tr);
        });
    };

    branchSel.addEventListener("change", refreshPreview);
    batchSel.addEventListener("change", refreshPreview);

    document.getElementById("btn-add-tt-subject")?.addEventListener("click", async () => {
        const branch = branchSel.value;
        const batch = batchSel.value;
        const day = document.getElementById("tt-day-select").value;
        const subject = document.getElementById("tt-subject-input").value.trim();

        if(!branch || !batch || !subject) {
            showToast("Select Branch/Batch and enter Subject", "error");
            return;
        }

        // Add to Timetable
        await set(ref(db, `timetable/${branch}/${batch}/${day}/${subject}`), true);
        
        // Ensure it exists in global subjects too so teachers can mark it
        await set(ref(db, `subjects/${subject}`), { created: Date.now() });

        document.getElementById("tt-subject-input").value = "";
        showToast(`Linked ${subject} to ${day}`);
        refreshPreview();
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
                // If current admin is HOD, only show their branch
                if (!isAdminMaster && currentAdminData && currentAdminData.branch) {
                    return matchesRole && s.branch === currentAdminData.branch;
                }
                return matchesRole;
            })
            .map(uid => ({
                uid,
                name: users[uid].name,
                regd: users[uid].regdNo,
                branch: users[uid].branch || "N/A"
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
  const batch = document.getElementById("admin-batch").value;

  if (!date || !subject || !branch || !batch) {
      return showToast("Please select Branch, Batch, Subject and Date", "error");
  }

  const btn = document.getElementById("btn-load-students");
  btn.innerHTML = "Loading...";

  try {
    const snapshot = await get(ref(db, "users"));
    if (!snapshot.exists()) {
      showToast("No students found.", "error");
      return;
    }

    // Filter students by branch and batch
    const students = Object.keys(users)
      .filter((uid) => {
          const u = users[uid];
          const isStudent = u.role === "student";
          const matchesBranch = u.branch === branch;
          const matchesBatch = u.batch === batch;
          
          let authorized = isStudent && matchesBranch && matchesBatch;
          
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
        if (confirm(`Send password reset email to ${email}?`)) {
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
        
        if (confirm(`Are you sure you want to ${actionWord} this account?`)) {
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
