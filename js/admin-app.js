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

// Authentication State Listener
let isAdminMaster = false;
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const dbRef = ref(db);
    try {
      const snapshot = await get(child(dbRef, `users/${user.uid}`));
      if (snapshot.exists()) {
        const userData = snapshot.val();
        
        // Master Admin Check: admin@gmail.com OR role is master
        isAdminMaster = (user.email === "admin@gmail.com" || userData.role === "master");
        
        if (userData.role === "admin" || userData.role === "master") {
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
document
  .getElementById("btn-logout-admin")
  .addEventListener("click", handleLogout);

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
let currentAdminStudents = [];
function initAdminDashboard(user, userData) {
  document.getElementById("admin-name-display").textContent = userData.name;

  // Set default date to today
  document.getElementById("admin-date").valueAsDate = new Date();

  // Listen for subjects
  const subjectsRef = ref(db, "subjects");
  onValue(subjectsRef, (snap) => {
    const sel = document.getElementById("admin-subject");
    sel.innerHTML = "";
    if (snap.exists()) {
      const allSubjects = snap.val();
      let subjectsToShow = Object.keys(allSubjects);

      // Filter if not master
      if (!isAdminMaster && userData.subjects) {
          subjectsToShow = subjectsToShow.filter(s => userData.subjects.includes(s));
      }

      if (subjectsToShow.length > 0) {
          subjectsToShow.forEach(s => {
            const opt = document.createElement("option");
            opt.value = opt.textContent = s;
            sel.appendChild(opt);
          });
      } else {
          const opt = document.createElement("option");
          opt.value = ""; opt.textContent = "No assigned subjects";
          sel.appendChild(opt);
      }
    } else {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "No subjects in system";
      sel.appendChild(opt);
    }
  });

  // Add subject listener
  const addSubjBtn = document.getElementById("btn-add-subject");
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

  // Listen for queries
  const queriesRef = ref(db, "queries");
  onValue(queriesRef, (snapshot) => {
    const tbody = document.getElementById("admin-queries-body");
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
  const fieldSubjects = document.getElementById("field-subjects");
  
  if (!isAdminMaster) {
      // Normal admins cannot create other admins
      document.getElementById("opt-reg-admin").remove();
  }

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
      const subjects = document.getElementById("admin-reg-subjects").value.trim();
      const password = document.getElementById("admin-reg-password").value;
      const errorEl = document.getElementById("admin-reg-error");
      
      btn.disabled = true;
      btn.innerHTML = '<span class="material-icons">hourglass_empty</span> Creating...';
      errorEl.textContent = "";

      try {
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
          createdAt: Date.now(),
          regdNo: regdNo
        };

        if (role === "admin") {
            // Split comma-separated subjects into an array
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
            .filter(uid => users[uid].role === "student")
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
  if (!date) return showToast("Please select a date", "error");

  const btn = document.getElementById("btn-load-students");
  btn.innerHTML = "Loading...";

  try {
    // Fetch students
    const snapshot = await get(ref(db, "users"));
    if (!snapshot.exists()) {
      showToast("No students found.", "error");
      return;
    }

    const users = snapshot.val();
    let students = Object.keys(users)
      .filter((uid) => users[uid].role === "student")
      .map((uid) => ({ uid, ...users[uid] }));

    // Filter students by branch for non-master admins
    const currentUserSnap = await get(ref(db, `users/${auth.currentUser.uid}`));
    const currentUserData = currentUserSnap.val();

    if (currentUserData.role !== "master" && currentUserData.email !== "admin@gmail.com" && currentUserData.branch) {
        students = students.filter(s => s.branch === currentUserData.branch);
    }

    currentAdminStudents = students;

    // Fetch existing attendance for this date -> subject
    const attendanceSnap = await get(ref(db, `attendance/${date}/${subject}`));
    const existingAtt = attendanceSnap.exists() ? attendanceSnap.val() : {};

    const tbody = document.getElementById("admin-roster-body");
    tbody.innerHTML = "";

    currentAdminStudents.forEach((student) => {
      const status = existingAtt[student.uid] || "absent"; // default absent

      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td><b>${student.name}</b></td>
                <td>${student.regdNo || student.email}</td>
                <td class="text-center">
                    <div class="switch-wrapper">
                        <input type="radio" name="att-${student.uid}" id="pres-${student.uid}" value="present" class="status-radio present" ${status === "present" ? "checked" : ""}>
                        <label for="pres-${student.uid}" class="status-label">Present</label>
                        
                        <input type="radio" name="att-${student.uid}" id="abs-${student.uid}" value="absent" class="status-radio absent" ${status === "absent" ? "checked" : ""}>
                        <label for="abs-${student.uid}" class="status-label">Absent</label>
                    </div>
                </td>
                <td class="text-center">
                    <button class="btn icon-btn btn-reset-pwd" data-email="${student.email}" title="Reset Password">
                        <span class="material-icons">lock_reset</span>
                    </button>
                </td>
            `;
      tbody.appendChild(tr);
    });

    document
      .getElementById("admin-roster-container")
      .classList.remove("hidden");
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    btn.innerHTML = '<span class="material-icons">people</span> Load Roster';
  }
}

// Delegate Reset Password clicks
document.getElementById("admin-roster-body").addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-reset-pwd");
    if (!btn) return;
    
    const email = btn.dataset.email;
    if (confirm(`Send password reset email to ${email}?`)) {
        try {
            await sendPasswordResetEmail(auth, email);
            showToast(`Password reset email sent to ${email}`);
        } catch (error) {
            showToast("Error: " + error.message, "error");
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
