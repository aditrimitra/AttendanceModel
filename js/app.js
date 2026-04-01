import {
  auth,
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
} from "./firebase-init.js";

// DOM Elements
const views = {
  login: document.getElementById("login-view"),
  register: document.getElementById("register-view"),
  student: document.getElementById("student-view"),
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

// Initial Routing
document.getElementById("btn-show-register").addEventListener("click", (e) => {
  e.preventDefault();
  switchView("register");
});
document.getElementById("btn-show-login").addEventListener("click", (e) => {
  e.preventDefault();
  switchView("login");
});

// Role Tab Toggling (Visual)
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  });
});

// Authentication State Listener
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Fetch user data
    const dbRef = ref(db);
    try {
      const snapshot = await get(child(dbRef, `users/${user.uid}`));
      if (snapshot.exists()) {
        const userData = snapshot.val();
        if (userData.role === "admin") {
          initAdminDashboard(user, userData);
          switchView("admin");
        } else {
          initStudentDashboard(user, userData);
          switchView("student");
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

// Login Logic
document.getElementById("login-form").addEventListener("submit", async (e) => {
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

// Register Logic
document
  .getElementById("register-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-register-submit");
    btn.innerHTML = "Creating...";
    btn.disabled = true;

    const name = document.getElementById("reg-name").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const role = document.querySelector('input[name="reg-role"]:checked').value;
    const errorEl = document.getElementById("register-error");
    errorEl.textContent = "";

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      // Save additional user info in DB
      await set(ref(db, "users/" + user.uid), {
        name: name,
        email: email,
        role: role,
      });
      showToast("Account created successfully!");
    } catch (error) {
      errorEl.textContent = error.message;
    } finally {
      btn.innerHTML = "Create Account";
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
  .getElementById("btn-logout-student")
  .addEventListener("click", handleLogout);
document
  .getElementById("btn-logout-admin")
  .addEventListener("click", handleLogout);

// Modal Logic
const queryModal = document.getElementById("query-modal");
document
  .getElementById("btn-open-query")
  .addEventListener("click", () => queryModal.classList.remove("hidden"));
document
  .getElementById("btn-close-modal")
  .addEventListener("click", () => queryModal.classList.add("hidden"));

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
      const subjects = snap.val();
      Object.keys(subjects).forEach(s => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = s;
        sel.appendChild(opt);
      });
    } else {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "No subjects added";
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
                    <td><b>${q.subject}</b></td>
                    <td>${q.message}</td>
                    <td>${new Date(q.timestamp).toLocaleString()}</td>
                `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML =
        '<tr><td colspan="4" class="text-center">No queries found.</td></tr>';
    }
  });

  document
    .getElementById("btn-load-students")
    .addEventListener("click", loadRoster);
  document
    .getElementById("btn-save-attendance")
    .addEventListener("click", saveAttendance);
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
    currentAdminStudents = Object.keys(users)
      .filter((uid) => users[uid].role === "student")
      .map((uid) => ({ uid, ...users[uid] }));

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
                <td>${student.email}</td>
                <td class="text-center">
                    <div class="switch-wrapper">
                        <input type="radio" name="att-${student.uid}" id="pres-${student.uid}" value="present" class="status-radio present" ${status === "present" ? "checked" : ""}>
                        <label for="pres-${student.uid}" class="status-label">Present</label>
                        
                        <input type="radio" name="att-${student.uid}" id="abs-${student.uid}" value="absent" class="status-radio absent" ${status === "absent" ? "checked" : ""}>
                        <label for="abs-${student.uid}" class="status-label">Absent</label>
                    </div>
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

// --- STUDENT DASHBOARD ---
let currentStudent = null;
function initStudentDashboard(user, userData) {
  currentStudent = { uid: user.uid, ...userData };
  document.getElementById("student-name-display").textContent = userData.name;

  // Set filter to current month
  const currentMonth = new Date().getMonth() + 1; // 1-12
  document.getElementById("student-month-filter").value = currentMonth;

  // Load attendance automatically based on filter
  loadStudentAttendance();
  document
    .getElementById("student-month-filter")
    .addEventListener("change", loadStudentAttendance);

  // Setup Query Form
  const queryForm = document.getElementById("query-form");
  // Remove old listeners to prevent duplication on re-init
  const newForm = queryForm.cloneNode(true);
  queryForm.parentNode.replaceChild(newForm, queryForm);

  newForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("query-title").value;
    const msg = document.getElementById("query-msg").value;

    try {
      await push(ref(db, "queries"), {
        studentId: currentStudent.uid,
        studentName: currentStudent.name,
        subject: title,
        message: msg,
        timestamp: Date.now(),
      });
      showToast("Query sent. The university will get back to you via email.");
      document.getElementById("query-modal").classList.add("hidden");
      newForm.reset();
    } catch (error) {
      showToast("Failed to send query", "error");
    }
  });
}

let studentAttendanceUnsubscribe = null;
let studentChartInstance = null;

function updateStudentChart(stats) {
  const ctx = document.getElementById("studentAttendanceChart");
  if (!ctx) return;
  
  if (studentChartInstance) {
    studentChartInstance.destroy();
  }
  
  const labels = Object.keys(stats);
  const data = labels.map((subj) => {
    const s = stats[subj];
    return s.held > 0 ? ((s.attended / s.held) * 100).toFixed(1) : 0;
  });

  studentChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Attendance %",
          data: data,
          backgroundColor: "rgba(139, 92, 246, 0.6)",
          borderColor: "#8b5cf6",
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#cbd5e1" },
        },
        x: {
          grid: { display: false },
          ticks: { color: "#cbd5e1" },
        },
      },
      plugins: {
        legend: { display: false },
      },
      animation: { duration: 1000, easing: "easeOutQuart" }
    },
  });
}

function loadStudentAttendance() {
  const selectedMonth = parseInt(
    document.getElementById("student-month-filter").value,
  );
  const tbody = document.getElementById("student-records-body");
  const attRef = ref(db, "attendance");

  if (studentAttendanceUnsubscribe) {
    studentAttendanceUnsubscribe();
  }

  studentAttendanceUnsubscribe = onValue(attRef, (snapshot) => {
    tbody.innerHTML = "";
    let totalHeld = 0;
    let totalAttended = 0;
    const subjectStats = {};

    if (snapshot.exists()) {
      const data = snapshot.val();
      // Data structure: date -> subject -> uid -> status
      Object.keys(data).forEach((date) => {
        const dateObj = new Date(date);
        if (dateObj.getMonth() + 1 === selectedMonth) {
          const subjects = data[date];
          Object.keys(subjects).forEach((subj) => {
            const records = subjects[subj];

            if (!subjectStats[subj]) {
              subjectStats[subj] = { held: 0, attended: 0 };
            }

            // We count a class as 'held' if the subject appears on this date
            subjectStats[subj].held++;
            totalHeld++;

            if (records[currentStudent.uid] === "present") {
              subjectStats[subj].attended++;
              totalAttended++;
            }
          });
        }
      });
    }

    if (Object.keys(subjectStats).length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="text-center text-muted">No attendance records for this month.</td></tr>';
      document.getElementById("student-month-percentage").textContent = "0%";
      updateStudentChart({});
      return;
    }

    // Render table
    Object.keys(subjectStats).forEach((subj) => {
      const stat = subjectStats[subj];
      const percentage =
        stat.held > 0 ? ((stat.attended / stat.held) * 100).toFixed(1) : 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td><b>${subj}</b></td>
                <td>${stat.held}</td>
                <td>${stat.attended}</td>
                <td>
                    <span style="color: ${percentage >= 75 ? "var(--success)" : "var(--danger)"}">
                        ${percentage}%
                    </span>
                </td>
            `;
      tbody.appendChild(tr);
    });

    // Update total percentage
    const overall =
      totalHeld > 0 ? ((totalAttended / totalHeld) * 100).toFixed(1) : 0;
    const monthEl = document.getElementById("student-month-percentage");
    monthEl.textContent = overall + "%";
    monthEl.style.color =
      overall >= 75
        ? "var(--success)"
        : overall > 0
          ? "var(--danger)"
          : "var(--text)";
          
    updateStudentChart(subjectStats);
  });
}
