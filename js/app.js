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
  sendPasswordResetEmail
} from "./firebase-init.js";

// DOM Elements
const views = {
  login: document.getElementById("login-view"),
  student: document.getElementById("student-view"),
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
// Removed public registration navigation

// Role Tab Toggling (Visual)
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  });
});

// Authentication State Listener
onAuthStateChanged(auth, async (user) => {
  const studentNav = document.getElementById("student-nav");
  if (user) {
    const dbRef = ref(db);
    try {
      const snapshot = await get(child(dbRef, `users/${user.uid}`));
      if (snapshot.exists()) {
        const userData = snapshot.val();
        const isAdminMaster = (userData.role === "admin" || userData.role === "master" || user.email === "aditrimitra@gmail.com");
        
        if (isAdminMaster) {
           // Admin/Master should always go to admin portal
           window.location.href = "admin.html";
           return;
        }

        if (userData.role === "student") {
          initStudentDashboard(user, userData);
          studentNav?.classList.remove("hidden");
          switchView("student");
        } else {
          showToast("Access Denied: Student account required.", "error");
          signOut(auth);
        }
      } else {
        signOut(auth);
      }
    } catch (error) {
      console.error(error);
    }
  } else {
    studentNav?.classList.add("hidden");
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

  const regdNo = document.getElementById("login-regd").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  try {
    // 1. Lookup email by Registration Number
    const mappingSnap = await get(ref(db, `regd_to_email/${regdNo}`));
    if (!mappingSnap.exists()) {
      throw new Error("Invalid Registration Number");
    }
    const email = mappingSnap.val();

    // 2. Sign in with the retrieved email
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    errorEl.textContent = error.message;
  } finally {
    btn.innerHTML = 'Sign In <span class="material-icons">east</span>';
    btn.disabled = false;
  }
});

// Logout
const showConfirm = (title, msg) => {
    return new Promise((resolve) => {
        const modal = document.getElementById("confirm-modal");
        const titleEl = document.getElementById("confirm-title");
        const msgEl = document.getElementById("confirm-msg");
        const okBtn = document.getElementById("confirm-ok");
        const cancelBtn = document.getElementById("confirm-cancel");

        if (!modal || !titleEl || !msgEl || !okBtn || !cancelBtn) {
            console.error("Modal elements missing");
            return resolve(confirm(msg)); // Fallback
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

const handleLogout = async () => {
  if (await showConfirm("Logout?", "Are you sure you want to log out of the student portal?")) {
      try {
        await signOut(auth);
        showToast("Logged out");
      } catch (error) {
        showToast("Logout failed", "error");
      }
  }
};
document.getElementById("btn-logout-student-desktop")?.addEventListener("click", handleLogout);
document.getElementById("btn-logout-student-mobile")?.addEventListener("click", handleLogout);

// Hamburger Menu Toggle
const hamburger = document.getElementById("hamburger-menu-student");
const mobileMenu = document.getElementById("mobile-menu-student");
const closeMenuStudent = document.getElementById("close-menu-student");

if (hamburger && mobileMenu) {
    hamburger.addEventListener("click", () => {
        hamburger.classList.toggle("open");
        mobileMenu.classList.toggle("active");
    });
    
    if (closeMenuStudent) {
        closeMenuStudent.addEventListener("click", () => {
            hamburger.classList.remove("open");
            mobileMenu.classList.remove("active");
        });
    }
}

// Modal Logic
const queryModal = document.getElementById("query-modal");
document
  .getElementById("btn-open-query")
  .addEventListener("click", () => queryModal.classList.remove("hidden"));
document
  .getElementById("btn-close-modal")
  .addEventListener("click", () => queryModal.classList.add("hidden"));

// --- STUDENT DASHBOARD ---
let currentStudent = null;
let currentSem = 1;

function initStudentDashboard(user, userData) {
  currentStudent = { uid: user.uid, ...userData };
  
  // Use Hardcoded Semester from Profile
  const sem = userData.sem || "1";
  currentSem = sem;

  document.getElementById("student-name-display-desktop").textContent = userData.name;
  document.getElementById("student-sem-display-desktop").textContent = `Sem ${sem}`;
  document.getElementById("student-name-display-mobile").textContent = userData.name;
  document.getElementById("student-sem-display-mobile").textContent = `Sem ${sem}`;
  document.getElementById("leaderboard-batch-title").textContent = `${userData.branch || 'Unknown'} - Sem ${sem}`;

  // Set filter to current month
  const currentMonth = new Date().getMonth() + 1; // 1-12
  document.getElementById("student-month-filter").value = currentMonth;

  // Load Dashboards
  loadStudentAttendance();
  loadStudentLeaderboard();
  loadTodaySchedule();

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
          backgroundColor: "rgba(147, 51, 234, 0.4)",
          borderColor: "#9333ea",
          borderWidth: 2,
          borderRadius: 8,
          hoverBackgroundColor: "#9333ea",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#94a3b8", font: { family: "'Outfit', sans-serif" } }
        },
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8", font: { family: "'Outfit', sans-serif" } }
        }
      },
      plugins: {
        legend: { display: false }
      },
      animation: { duration: 1500, easing: "easeOutQuart" }
    }
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

// Leaderboard Logic
async function loadStudentLeaderboard() {
    const tbody = document.getElementById("student-leaderboard-body");
    try {
        const usersSnap = await get(ref(db, "users"));
        const attSnap = await get(ref(db, "attendance"));
        
        if (!usersSnap.exists()) return;
        const users = usersSnap.val();
        const attendance = attSnap.exists() ? attSnap.val() : {};

        // Filter for Same Branch AND Same Batch
        const students = Object.keys(users)
            .filter(uid => 
                users[uid].role === "student" && 
                users[uid].branch === currentStudent.branch && 
                users[uid].batch === currentStudent.batch
            )
            .map(uid => ({
                uid,
                name: users[uid].name
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
                <td>${student.uid === currentStudent.uid ? `<span style="color:var(--primary); font-weight:700;">${student.name} (You)</span>` : student.name}</td>
                <td><span class="stat-value" style="font-size: 1.1rem; color: ${student.percentage >= 75 ? "var(--success)" : "var(--danger)"}">${student.percentage.toFixed(1)}%</span></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Leaderboard error</td></tr>';
    }
}

// Today Schedule Logic
async function loadTodaySchedule() {
    const tbody = document.getElementById("student-today-body");
    const dateDisplay = document.getElementById("today-date-display");
    
    const today = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    const dateString = today.toISOString().split('T')[0];
    dateDisplay.textContent = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    try {
        // 1. Fetch Timetable for this student's Branch/Sem/Day
        const branch = currentStudent.branch;
        const sem = currentStudent.sem;
        
        if(!branch || !sem) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Branch/Sem info missing.</td></tr>';
            return;
        }

        const ttSnap = await get(ref(db, `timetable/${branch}/${sem}/${dayName}`));
        const ttEntries = ttSnap.exists() ? Object.values(ttSnap.val()) : [];

        // 2. Fetch existing attendance for today
        const attSnap = await get(ref(db, `attendance/${dateString}`));
        const attendanceToday = attSnap.exists() ? attSnap.val() : {};
        
        tbody.innerHTML = "";
        
        if (ttEntries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No classes scheduled for today.</td></tr>';
            return;
        }

        ttEntries.forEach(entry => {
            const subj = entry.subject;
            const time = entry.timeSlot || "N/A";
            const teacher = entry.teacherName || "N/A";
            const tr = document.createElement("tr");
            let statusBadge = '<span class="text-muted">Not Recorded</span>';
            
            if (attendanceToday[subj] && attendanceToday[subj][currentStudent.uid]) {
                const status = attendanceToday[subj][currentStudent.uid];
                if (status === 'present') {
                    statusBadge = '<span style="color:var(--success); font-weight:600;">Present <span class="material-icons" style="font-size:1rem; vertical-align:middle;">check_circle</span></span>';
                } else {
                    statusBadge = '<span style="color:var(--danger); font-weight:600;">Absent <span class="material-icons" style="font-size:1rem; vertical-align:middle;">cancel</span></span>';
                }
            }

            tr.innerHTML = `
                <td>${time}</td>
                <td><b>${subj}</b></td>
                <td style="color:var(--primary); font-weight:500;">${teacher}</td>
                <td>${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Failed to load schedule.</td></tr>';
    }
}

// Global Password Visibility Toggle
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

