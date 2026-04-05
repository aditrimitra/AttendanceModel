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

        // Click outside to close (Student)
        document.addEventListener("click", (e) => {
            if (!mobileMenu.contains(e.target) && !hamburger.contains(e.target) && mobileMenu.classList.contains("active")) {
                hamburger.classList.remove("open");
                mobileMenu.classList.remove("active");
            }
        });

        // Student Nav Tab Logic (Desktop & Mobile)
        const allStudentTabs = document.querySelectorAll(".student-tab-btn, .student-nav-btn");
        allStudentTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                const targetTab = tab.dataset.tab;
                if (!targetTab) return;

                // Update active button state
                allStudentTabs.forEach(t => t.classList.remove("active"));
                document.querySelectorAll(`[data-tab="${targetTab}"]`).forEach(t => t.classList.add("active"));
                
                // Show corresponding panel
                document.querySelectorAll("#student-view .tab-panel").forEach(p => p.classList.remove("active"));
                document.getElementById(targetTab)?.classList.add("active");

                // Close mobile menu if open
                if (hamburger) hamburger.classList.remove("open");
                if (mobileMenu) mobileMenu.classList.remove("active");
            });
        });
    }
}

// Student Global Notification Bell Click
document.getElementById("btn-show-notifications")?.addEventListener("click", () => {
     // Trigger click on Queries tab button
     const queriesTabStr = 'student-queries-view';
     document.querySelectorAll(`[data-tab="${queriesTabStr}"]`).forEach(t => t.click());
});

// Modal Logic
const queryModal = document.getElementById("query-modal");
const openQueryBtns = ["btn-new-query", "btn-open-query"];
openQueryBtns.forEach(id => {
  document.getElementById(id)?.addEventListener("click", () => queryModal.classList.add("active"));
});

// Close buttons for different modals
const closeQueryModal = document.getElementById("btn-close-query-modal");
closeQueryModal?.addEventListener("click", () => queryModal.classList.remove("active"));

document
  .getElementById("btn-close-modal") // Generic close button fallback
  ?.addEventListener("click", () => {
      document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
  });

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
  loadStudentSchedule();
  initSupportSystem();

  document
    .getElementById("leaderboard-subject-filter")
    .addEventListener("change", loadStudentLeaderboard);

  document
    .getElementById("student-month-filter")
    .addEventListener("change", loadStudentAttendance);

  document
    .getElementById("student-schedule-day-filter")
    .addEventListener("change", loadStudentSchedule);

  // Setup Query Form
  const queryForm = document.getElementById("query-form");
  if (queryForm) {
    queryForm.onsubmit = async (e) => {
      e.preventDefault();
      const title = document.getElementById("query-title").value;
      const msg = document.getElementById("query-msg").value;

      const submitBtn = queryForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="material-icons spinning">hourglass_empty</span> Sending...';
      
      try {
        await push(ref(db, "queries"), {
          studentId: currentStudent.uid,
          studentName: currentStudent.name,
          studentRegd: currentStudent.regdNo,
          subject: title,
          message: msg,
          timestamp: Date.now(),
          status: "unread" // for notif tracking
        });
        showToast("Query sent successfully!");
        const modal = document.getElementById("query-modal");
        if (modal) modal.classList.remove("active");
        queryForm.reset();
      } catch (error) {
        showToast("Failed to send query: " + error.message, "error");
      } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="material-icons">send</span> Submit Query';
      }
    };
  }
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
    const subjectFilter = document.getElementById("leaderboard-subject-filter").value;

    try {
        const usersSnap = await get(ref(db, "users"));
        const attSnap = await get(ref(db, "attendance"));
        
        if (!usersSnap.exists()) return;
        const users = usersSnap.val();
        const attendance = attSnap.exists() ? attSnap.val() : {};

        // Find available subjects for this batch to populate filter if not done
        const filterSel = document.getElementById("leaderboard-subject-filter");
        if (filterSel.options.length === 1) {
            const batchSubjects = new Set();
            Object.values(attendance).forEach(dateData => {
                Object.keys(dateData).forEach(subj => batchSubjects.add(subj));
            });
            batchSubjects.forEach(subj => {
                const opt = document.createElement("option");
                opt.value = subj;
                opt.textContent = subj;
                filterSel.appendChild(opt);
            });
        }

        // Filter for Same Branch AND Semester
        const students = Object.keys(users)
            .filter(uid => 
                users[uid].role === "student" && 
                users[uid].branch === currentStudent.branch && 
                users[uid].sem == currentSem
            )
            .map(uid => ({
                uid,
                name: users[uid].name
            }));

        const leaderboardData = students.map(student => {
            let totalHeld = 0;
            let totalAttended = 0;

            Object.values(attendance).forEach(dateData => {
                if (dateData && typeof dateData === 'object') {
                    Object.keys(dateData).forEach(subject => {
                        // Filter matching
                        if (subjectFilter !== "overall" && subject !== subjectFilter) return;

                        const records = dateData[subject];
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
        console.error("Leaderboard Error:", e);
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Leaderboard error</td></tr>';
    }
}

// Support & Notifications Logic
async function initSupportSystem() {
    const queriesRef = ref(db, "queries");
    
    // Listen for current student's queries (With Notification Counting)
    onValue(queriesRef, (snapshot) => {
        const tbody = document.getElementById("student-queries-list-body");
        const notifBadge = document.getElementById("notif-badge");
        if(!tbody || !currentStudent) return;
        
        tbody.innerHTML = "";
        let newReplyCount = 0;

        if (snapshot.exists()) {
            const data = snapshot.val();
            const myQueries = Object.keys(data)
                .map(k => ({id: k, ...data[k]}))
                .filter(q => q.studentRegd === currentStudent.regdNo);
            
            if (myQueries.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No queries submitted yet.</td></tr>';
                notifBadge?.classList.add("hidden");
                return;
            }

            myQueries.sort((a,b) => b.timestamp - a.timestamp).forEach(q => {
                const tr = document.createElement("tr");
                const isReplied = q.reply ? true : false;
                
                // If it's a reply and student hasn't 'marked as read' (placeholder logic)
                if (isReplied && !q.readByStudent) {
                    newReplyCount++;
                }

                tr.innerHTML = `
                    <td>
                        <div style="font-weight:600;">${q.subject}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${q.message}</div>
                    </td>
                    <td><span class="badge" style="background: ${isReplied ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)"}; color: ${isReplied ? "var(--success)" : "var(--danger)"}; border-radius: 4px; padding: 2px 8px; font-size: 0.75rem;">${isReplied ? "Replied" : "Pending"}</span></td>
                    <td>
                        ${isReplied ? `<b>Admin:</b> ${q.reply}` : '<span style="color:var(--text-muted); font-size: 0.85rem;">Waiting for response...</span>'}
                    </td>
                    <td style="font-size: 0.75rem;">${new Date(q.timestamp).toLocaleDateString()}</td>
                    <td class="text-center">
                        <div class="action-menu-container">
                            <button class="btn-more" title="More Actions">
                                <span class="material-icons">more_vert</span>
                            </button>
                            <div class="action-dropdown">
                                ${isReplied ? `
                                <button class="menu-item btn-student-reply-query" data-id="${q.id}" data-subject="${q.subject}">
                                    <span class="material-icons">reply</span> Follow Up
                                </button>
                                ` : ''}
                                <button class="menu-item btn-student-delete-query danger" data-id="${q.id}">
                                    <span class="material-icons">delete</span> Delete
                                </button>
                            </div>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Update Badge
            if (newReplyCount > 0) {
                if(notifBadge) {
                   notifBadge.textContent = newReplyCount > 9 ? "+9" : `+${newReplyCount}`;
                   notifBadge.classList.remove("hidden");
                }
            } else {
                notifBadge?.classList.add("hidden");
            }
        }
    });

    // Clear notifications on click (And Navigate to Queries)
    document.getElementById("btn-show-notifications")?.addEventListener("click", () => {
        const notifBadge = document.getElementById("notif-badge");
        if(notifBadge) notifBadge.classList.add("hidden");
        // No longer scrolling, since we are in tabs. Ensure query tab is active
        document.querySelector('[data-tab="student-queries-view"]')?.click();
    });

    // Event Delegation for Student Query Actions
    document.getElementById("student-queries-list-body")?.addEventListener("click", async (e) => {
        const deleteBtn = e.target.closest(".btn-student-delete-query");
        if (deleteBtn) {
            const qId = deleteBtn.dataset.id;
            if (await showConfirm("Delete Query", "Are you sure you want to delete this query?")) {
                try {
                    await set(ref(db, `queries/${qId}`), null);
                    showToast("Query deleted successfully.");
                } catch (err) {
                    showToast("Failed to delete: " + err.message, "error");
                }
            }
            return;
        }

        const replyBtn = e.target.closest(".btn-student-reply-query");
        if (replyBtn) {
            const subject = replyBtn.dataset.subject;
            document.getElementById("query-title").value = "Re: " + subject;
            document.getElementById("query-modal").classList.add("active");
            document.getElementById("query-msg").focus();
            return; // dropdown will be closed by global click handler
        }
    });
}

// Schedule Logic
async function loadStudentSchedule() {
    const tbody = document.getElementById("student-today-body");
    const dayFilterEl = document.getElementById("student-schedule-day-filter");
    
    // Automatically set filter to today if it's the first load
    if (!dayFilterEl.dataset.initialized) {
        const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        // Set if it's Monday-Saturday
        if(dayFilterEl.querySelector(`option[value="${todayName}"]`)) {
             dayFilterEl.value = todayName;
        }
        dayFilterEl.dataset.initialized = "true";
    }

    const dayName = dayFilterEl.value;
    
    try {
        const branch = currentStudent.branch;
        const sem = currentStudent.sem;
        
        if(!branch || !sem) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Branch/Sem info missing.</td></tr>';
            return;
        }

        const ttSnap = await get(ref(db, `timetable/${branch}/${sem}/${dayName}`));
        const ttEntries = ttSnap.exists() ? Object.values(ttSnap.val()) : [];

        // Update Today's Classes Count for Analytics Tab if the filter day matches actual today
        const actualToday = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        if (dayName === actualToday) {
             const countEl = document.getElementById("today-classes-count");
             if (countEl) countEl.textContent = ttEntries.length;
        }
        
        tbody.innerHTML = "";
        
        if (ttEntries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No classes scheduled for this day.</td></tr>';
            return;
        }

        ttEntries.forEach(entry => {
            const subj = entry.subject;
            const time = entry.timeSlot || "N/A";
            const teacher = entry.teacherName || "N/A";
            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>${time}</td>
                <td><b>${subj}</b></td>
                <td style="color:var(--primary); font-weight:500;">${teacher}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Failed to load schedule.</td></tr>';
    }
}

// Global Dropdown & Password Visibility Handler
document.addEventListener("click", (e) => {
    // --- 3-Dots Menu Toggle ---
    const moreBtn = e.target.closest(".btn-more");
    const allDropdowns = document.querySelectorAll(".action-dropdown");
    
    if (moreBtn) {
        const dropdown = moreBtn.parentElement.querySelector(".action-dropdown");
        const isOpen = dropdown.classList.contains("active");
        
        allDropdowns.forEach(d => d.classList.remove("active"));
        if (!isOpen) dropdown.classList.add("active");
        return;
    }
    
    // Close if click outside dropdown
    if (!e.target.closest(".action-menu-container")) {
        allDropdowns.forEach(d => d.classList.remove("active"));
    }

    // --- Password Toggle ---
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

