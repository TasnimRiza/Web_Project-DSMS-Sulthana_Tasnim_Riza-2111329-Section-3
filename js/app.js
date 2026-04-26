const DB_URL = "data/db.json";
const STORAGE_KEY = "digital-schooling-system-db";

const roleLabels = {
  student: "Student",
  teacher: "Teacher",
  headteacher: "Headteacher",
  upo: "UPO Admin"
};

const rolePages = {
  student: "student.html",
  teacher: "teacher.html",
  headteacher: "headteacher.html",
  upo: "upo.html"
};

const roleSections = {
  student: ["Overview", "Attendance", "Classes", "Assignments", "Exam Routine", "Exam", "Results"],
  teacher: ["Overview", "My Attendance", "Class Schedule", "Assignments", "Assignment materials", "Student Attendance", "Exams", "Exams Question"],
  headteacher: ["Overview", "Teacher Schedule", "Teacher Attendance", "Classrooms", "Students", "Approvals"],
  upo: ["Overview", "Users", "Attendance Monitor", "School Management", "Approvals"]
};

let db = null;
let activeUser = null;
let activeSection = "Overview";
let editingStudentId = null;
let editingSchoolId = null;
let materialBuilder = {
  mode: null,
  tokens: []
};
let examQuestionDraft = {
  examId: "",
  questions: ""
};

const materialTokenSets = {
  "Bangla Shobdho": ["আম", "বই", "কলম", "ঘর", "ফুল", "পাখি", "নদী", "মাটি", "দেশ", "স্কুল", "শিক্ষক", "ছাত্র"],
  "English Letters": "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
};

const els = {
  page: document.body.dataset.page,
  requiredRole: document.body.dataset.role,
  loginForm: document.querySelector("#loginForm"),
  loginStatus: document.querySelector("#loginStatus"),
  roleSelect: document.querySelector("#roleSelect"),
  userSelect: document.querySelector("#userSelect"),
  schoolSelect: document.querySelector("#schoolSelect"),
  schoolSelectLabel: document.querySelector("#schoolSelectLabel"),
  loginBtn: document.querySelector("#loginBtn"),
  roleNav: document.querySelector("#roleNav"),
  dashboard: document.querySelector("#dashboard"),
  dashboardTitle: document.querySelector("#dashboardTitle"),
  roleEyebrow: document.querySelector("#roleEyebrow"),
  sessionCard: document.querySelector("#sessionCard"),
  heroTitle: document.querySelector("#heroTitle"),
  heroCopy: document.querySelector("#heroCopy"),
  heroStats: document.querySelector("#heroStats"),
  notice: document.querySelector("#notice"),
  saveJsonBtn: document.querySelector("#saveJsonBtn"),
  resetDataBtn: document.querySelector("#resetDataBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  cardTemplate: document.querySelector("#cardTemplate")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  db = await loadDatabase();
  if (els.page === "login") {
    initLoginPage();
    return;
  }
  initDashboardPage();
}

async function loadDatabase() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const savedDb = JSON.parse(saved);
    migrateDatabase(savedDb);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedDb));
    return savedDb;
  }

  const response = await fetch(DB_URL);
  const freshDb = await response.json();
  migrateDatabase(freshDb);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(freshDb));
  return freshDb;
}

function migrateDatabase(database) {
  if (!database.schools) {
    database.schools = [{
      id: "school-primary",
      name: database.school.name,
      upazila: database.school.upazila,
      session: database.school.session,
      headteacherId: "head-fahim"
    }];
  }

  database.users.forEach((user) => {
    if (!("schoolId" in user) && user.role !== "upo") user.schoolId = database.schools[0]?.id || "";
  });

  database.schools.forEach((school) => {
    if (!("headteacherId" in school)) {
      school.headteacherId = database.users.find((user) => user.role === "headteacher" && user.schoolId === school.id)?.id || "";
    }
  });

  database.school = database.schools[0] || database.school;
  if (!database.assignmentMaterials) database.assignmentMaterials = [];
  if (!database.examSubmissions) database.examSubmissions = [];

  database.assignmentMaterials.forEach((material) => {
    if (material.wordSet === "English Words") material.wordSet = "English Letters";
  });

  database.exams.forEach((exam) => {
    if (!("description" in exam)) exam.description = "";
    if (!("teacherId" in exam)) exam.teacherId = teacherForExam(database, exam);
    if (!("questions" in exam)) exam.questions = "";
    if (!("questionsPublished" in exam)) exam.questionsPublished = false;
    if (!("started" in exam)) exam.started = false;
  });

  database.assignments.forEach((assignment) => {
    if (assignment.instructions === "Write five formal letters following the Figma reference layout.") {
      assignment.instructions = "Write five formal letters by following instructions.";
    }
  });
}

function initLoginPage() {
  els.roleSelect.addEventListener("change", hydrateUserSelect);
  els.userSelect.addEventListener("change", hydrateSchoolSelect);
  els.loginForm.addEventListener("submit", handleLogin);
  hydrateRoleSelect();
}

function initDashboardPage() {
  const activeUserId = sessionStorage.getItem("activeUserId");
  activeUser = findUser(activeUserId);

  if (!activeUser) {
    window.location.href = "index.html";
    return;
  }

  if (activeUser.role !== els.requiredRole) {
    window.location.href = rolePages[activeUser.role] || "index.html";
    return;
  }

  bindDashboardEvents();
  renderApp();
}

function bindDashboardEvents() {
  if (els.saveJsonBtn) els.saveJsonBtn.addEventListener("click", downloadJson);
  els.logoutBtn.addEventListener("click", logout);
  els.dashboard.addEventListener("click", handleDashboardClick);
  els.dashboard.addEventListener("submit", handleFormSubmit);
}

function handleLogin(event) {
  event.preventDefault();
  const selectedUser = findUser(els.userSelect.value);

  if (!selectedUser) {
    els.loginStatus.textContent = "Please select a valid profile.";
    return;
  }

  if (selectedUser.role === "headteacher") {
    const selectedSchool = schoolForHeadteacher(selectedUser.id).find((school) => school.id === els.schoolSelect.value);
    if (!selectedSchool) {
      els.loginStatus.textContent = "Please select an assigned school.";
      return;
    }
    sessionStorage.setItem("activeSchoolId", selectedSchool.id);
  } else {
    sessionStorage.setItem("activeSchoolId", selectedUser.schoolId || db.schools[0]?.id || "");
  }

  sessionStorage.setItem("activeUserId", selectedUser.id);
  window.location.href = rolePages[selectedUser.role];
}

function hydrateRoleSelect() {
  els.roleSelect.innerHTML = Object.entries(roleLabels)
    .map(([role, label]) => `<option value="${role}">${label}</option>`)
    .join("");
  hydrateUserSelect();
}

function hydrateUserSelect() {
  const role = els.roleSelect.value;
  const users = db.users.filter((user) => user.role === role);
  els.userSelect.innerHTML = users
    .map((user) => `<option value="${user.id}">${user.name}</option>`)
    .join("");
  hydrateSchoolSelect();
}

function hydrateSchoolSelect() {
  if (!els.schoolSelect || !els.schoolSelectLabel) return;

  const role = els.roleSelect.value;
  const selectedUser = findUser(els.userSelect.value);
  const showSchoolSelect = role === "headteacher";
  els.schoolSelect.hidden = !showSchoolSelect;
  els.schoolSelectLabel.hidden = !showSchoolSelect;

  if (!showSchoolSelect) {
    els.schoolSelect.innerHTML = "";
    return;
  }

  const schools = schoolForHeadteacher(selectedUser?.id);
  els.schoolSelect.innerHTML = schools.length
    ? schools.map((school) => `<option value="${school.id}">${escapeHtml(school.name)}</option>`).join("")
    : `<option value="">No assigned school</option>`;
}

function renderApp() {
  renderNav();
  renderHero();
  els.roleEyebrow.textContent = roleLabels[activeUser.role];
  els.dashboardTitle.textContent = `${activeUser.name}'s ${activeSection}`;
  els.sessionCard.innerHTML = `<strong>${activeUser.name}</strong><br>${roleLabels[activeUser.role]}${activeUser.className ? ` - ${activeUser.className}` : ""}<br>${escapeHtml(activeSchool()?.name || "")}`;
  els.dashboard.innerHTML = "";

  const renderer = getRenderer(activeUser.role, activeSection);
  renderer();
}

function renderNav() {
  els.roleNav.innerHTML = roleSections[activeUser.role]
    .map((section) => `<button class="tab-btn ${section === activeSection ? "active" : ""}" data-section="${section}" type="button">${section}</button>`)
    .join("");

  els.roleNav.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSection = button.dataset.section;
      renderApp();
    });
  });
}

function renderHero() {
  const students = db.users.filter((user) => user.role === "student").length;
  const teachers = db.users.filter((user) => user.role === "teacher").length;
  const presentToday = todaysAttendance().filter((row) => row.status === "Present").length;

  els.heroTitle.textContent = activeUser.role === "upo" ? "Upozela Sikkha officer." : `${activeSchool()?.name || db.school.name}`;
  els.heroCopy.textContent = `${activeUser.name} is logged in as ${roleLabels[activeUser.role]}. Manage attendance, class work, exams, approvals, and school records.`;
  els.heroStats.innerHTML = [
    stat("Students", students),
    stat("Teachers", teachers),
    stat("Present today", presentToday)
  ].join("");
}

function getRenderer(role, section) {
  const key = `${role}:${section}`;
  const routes = {
    "student:Overview": renderStudentOverview,
    "student:Attendance": renderSelfAttendance,
    "student:Classes": renderStudentClasses,
    "student:Assignments": renderStudentAssignments,
    "student:Exam Routine": renderStudentExams,
    "student:Exam": renderStudentExam,
    "student:Results": renderStudentResults,
    "teacher:Overview": renderTeacherOverview,
    "teacher:My Attendance": renderSelfAttendance,
    "teacher:Class Schedule": renderTeacherSchedule,
    "teacher:Assignments": renderTeacherAssignments,
    "teacher:Assignment materials": renderTeacherAssignmentMaterials,
    "teacher:Student Attendance": renderStudentAttendanceManager,
    "teacher:Exams": renderTeacherExams,
    "teacher:Exams Question": renderTeacherExamQuestions,
    "headteacher:Overview": renderHeadteacherOverview,
    "headteacher:Teacher Schedule": renderScheduleManager,
    "headteacher:Teacher Attendance": renderTeacherAttendanceManager,
    "headteacher:Classrooms": renderClassroomManager,
    "headteacher:Students": renderStudentManager,
    "headteacher:Approvals": renderApprovalManager,
    "upo:Overview": renderUpoOverview,
    "upo:Users": renderUserManager,
    "upo:Attendance Monitor": renderAttendanceMonitor,
    "upo:School Management": renderSchoolManager,
    "upo:Approvals": renderApprovalManager
  };
  return routes[key] || renderEmpty;
}

function renderStudentOverview() {
  addCard("Today", "Your school day", list([
    item("Attendance", hasAttendanceToday(activeUser.id) ? "Present today" : "Attendance not submitted", hasAttendanceToday(activeUser.id) ? "Present" : "Pending"),
    item("Next class", nextClassForStudent(activeUser)?.subject || "No class scheduled", nextClassForStudent(activeUser)?.time || "Check schedule"),
    item("Assignments", `${assignmentsForStudent(activeUser).length} active assignment(s)`, "Class work")
  ]));
  renderStudentAssignments();
}

function renderSelfAttendance() {
  const rows = db.attendance.filter((row) => row.userId === activeUser.id);
  addCard("Attendance", "Give your own attendance", `
    <div class="actions">
      <button class="small-btn" data-action="mark-self-present" type="button">Mark present today</button>
    </div>
    ${attendanceTable(rows)}
  `, true);
}

function renderStudentClasses() {
  addCard("Routine", "Your class schedule", scheduleTable(schedulesForClass(activeUser.className)), true);
}

function renderStudentAssignments() {
  addCard("Assignments", "Assigned class work", assignmentList(assignmentsForStudent(activeUser)), true);
}

function renderStudentExams() {
  addCard("Exam Routine", "Approved and pending exams", examTable(examsForClass(activeUser.className), false), true);
}

function renderStudentExam() {
  const rows = availableExamsForStudent(activeUser);
  addCard("Exam", "Started exam questions", studentExamList(rows), true);
}

function renderStudentResults() {
  const rows = db.results.filter((result) => result.studentId === activeUser.id);
  addCard("Results", "Subject marks", resultTable(rows), true);
}

function renderTeacherOverview() {
  addCard("Teacher", "Daily work", list([
    item("Attendance", hasAttendanceToday(activeUser.id) ? "Present today" : "Not submitted", hasAttendanceToday(activeUser.id) ? "Present" : "Pending"),
    item("Classes", `${schedulesForTeacher(activeUser.id).length} scheduled class(es)`, activeUser.subject),
    item("Assignments", `${assignmentsForTeacher(activeUser.id).length} created`, "Class work")
  ]));
  renderTeacherSchedule();
}

function renderTeacherSchedule() {
  addCard("Schedule", "Classes assigned by headteacher", scheduleTable(schedulesForTeacher(activeUser.id)), true);
}

function renderTeacherAssignments() {
  addCard("Create", "New assignment", assignmentForm(), false);
  addCard("Assignments", "Your assignment list", assignmentList(assignmentsForTeacher(activeUser.id)), false);
}

function renderTeacherAssignmentMaterials() {
  addCard("Publish", "Assignment materials", assignmentMaterialForm(), true);
  addCard("Published", "Assignment material list", assignmentMaterialTable(assignmentMaterialsForTeacher(activeUser.id)), true);
}

function renderStudentAttendanceManager() {
  const students = db.users.filter((user) => user.role === "student");
  addCard("Student Attendance", "Take attendance for students", userAttendanceButtons(students, "student"), true);
}

function renderTeacherExams() {
  addCard("Request Exam", "Create an exam for approval", examForm(), false);
  addCard("Exam Routine", "Exam requests and approved routines", examTable(examsForTeacher(activeUser.id), false), true);
  addCard("Active Exam", "Approved exams with published questions", activeExamTable(readyExamsForTeacher(activeUser.id)), true);
}

function renderTeacherExamQuestions() {
  addCard("Generate", "Exams Question", examQuestionForm(), true);
  addCard("Published", "Published exam questions", examQuestionTable(questionedExamsForTeacher(activeUser.id)), true);
}

function renderHeadteacherOverview() {
  const headteacherActivities = activitiesForHeadteacher(activeUser.id);
  addCard("Headteacher", "School management", list([
    item("Teacher schedules", `${db.schedules.length} routine row(s)`, "Editable"),
    item("Classrooms", `${db.classrooms.length} room(s)`, "Managed"),
    item("Pending activities", `${headteacherActivities.filter((activity) => activity.status === "Pending").length} request(s)`, "Approval")
  ]));
  renderApprovalManager();
}

function renderScheduleManager() {
  addCard("Add Schedule", "Assign teacher class schedule", scheduleForm(), true);
  addCard("Schedule Records", "Edit, update, or delete schedule rows", editableScheduleTable(), true);
}

function renderTeacherAttendanceManager() {
  const teachers = db.users.filter((user) => user.role === "teacher");
  addCard("Teacher Attendance", "Record teacher attendance", userAttendanceButtons(teachers, "teacher"), true);
}

function renderClassroomManager() {
  addCard("Classrooms", "Manage school rooms", classroomForm() + classroomTable(), true);
}

function renderStudentManager() {
  const students = db.users.filter((user) => user.role === "student");
  const editingStudent = editingStudentId ? findUser(editingStudentId) : null;
  addCard("Students", "Manage student records", userForm("student", true, editingStudent) + userTable(students), true);
}

function renderUpoOverview() {
  const schools = db.schools.length;
  const headteachersAssigned = db.schools.filter((school) => school.headteacherId).length;
  const avgResult = averageStudentResult();
  addCard("UPO", "Whole-system administration", list([
    item("Schools", `${schools} school(s)`, "Manage"),
    item("Assigned headteachers", `${headteachersAssigned} assigned`, "School lead"),
    item("Average student result", `${avgResult}%`, "Performance")
  ]));
  addCard("Performance", "Overall school performance", performanceGraph(), true);
}

function renderUserManager() {
  addCard("Add User", "Create headteacher, teacher, or student", userForm(), true);
  addCard("Users", "Whole school profiles", userTable(db.users), true);
}

function renderAttendanceMonitor() {
  addCard("Attendance Monitor", "Headteacher, teacher, and student attendance", attendanceTable(db.attendance), true);
}

function renderSchoolManager() {
  const editingSchool = editingSchoolId ? findSchool(editingSchoolId) : null;
  addCard("School", "Add, update, and assign headteacher", schoolForm(editingSchool), true);
  addCard("Schools", "Managed school list", schoolTable(), true);
  addCard("Classrooms", "Classroom overview", classroomTable(), false);
}

function renderApprovalManager() {
  if (activeUser.role === "headteacher") {
    addCard("Add Activity", "Create major school activity", activityForm(), false);
    addCard("Exam Requests", "Approve or reject teacher exam requests", examTable(db.exams, true), true);
    addCard("Activities", "Submitted school activities", activityTable(activitiesForHeadteacher(activeUser.id)), true);
    return;
  }

  addCard("Approvals", "Approve major school activity", activityTable(db.activities), true);
}

function renderEmpty() {
  addCard("Empty", "No module available", `<div class="empty-state">This module is ready for future expansion.</div>`, true);
}

function addCard(kicker, title, body, wide = false) {
  const fragment = els.cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".panel-card");
  card.classList.toggle("wide", wide);
  fragment.querySelector(".card-kicker").textContent = kicker;
  fragment.querySelector(".card-title").textContent = title;
  fragment.querySelector(".card-body").innerHTML = body;
  els.dashboard.appendChild(fragment);
}

function handleDashboardClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === "mark-self-present") markAttendance(activeUser.id, activeUser.role, "Present", activeUser.id);
  if (action === "mark-present") markAttendance(id, button.dataset.role, "Present", activeUser.id);
  if (action === "mark-absent") markAttendance(id, button.dataset.role, "Absent", activeUser.id);
  if (action === "update-schedule") updateSchedule(id);
  if (action === "delete-schedule") removeById("schedules", id);
  if (action === "update-user") editUser(id);
  if (action === "delete-user") removeById("users", id);
  if (action === "update-room") updateClassroom(id);
  if (action === "delete-room") removeById("classrooms", id);
  if (action === "update-school") editSchool(id);
  if (action === "approve-activity") updateStatus("activities", id, "Approved");
  if (action === "reject-activity") rejectActivity(id);
  if (action === "approve-exam") updateStatus("exams", id, "Approved");
  if (action === "reject-exam") updateStatus("exams", id, "Rejected");
  if (action === "generate-exam-question") generateExamQuestion(button);
  if (action === "start-exam") startExam(id);
  if (action === "choose-material-mode") chooseMaterialMode(button.dataset.mode);
  if (action === "add-material-token") addMaterialToken(button.dataset.token);
  if (action === "remove-material-token") removeMaterialToken(Number(button.dataset.index));
  if (action === "clear-material-builder") clearMaterialBuilder();
}

function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formType = form.dataset.form;
  const data = Object.fromEntries(new FormData(form).entries());

  if (formType === "assignment") {
    db.assignments.push({ id: uid("asg"), teacherId: activeUser.id, ...data });
  }

  if (formType === "assignment-material") {
    if (!data.questions) {
      showNotice("Select at least one item before publishing.");
      return;
    }

    db.assignmentMaterials.push({
      id: uid("mat"),
      teacherId: activeUser.id,
      assignmentId: data.assignmentId,
      classroomId: data.classroomId,
      date: data.date,
      time: data.time,
      wordSet: data.wordSet,
      questions: data.questions,
      status: "Published"
    });
    clearMaterialBuilder(false);
  }

  if (formType === "exam") {
    db.exams.push({ id: uid("exam"), teacherId: activeUser.id, status: "Pending approval", questions: "", questionsPublished: false, started: false, ...data });
    db.activities.push({ id: uid("act"), title: `${data.className} ${data.subject} exam`, type: "Exam", requestedBy: activeUser.id, status: "Pending" });
  }

  if (formType === "exam-question") {
    const exam = db.exams.find((row) => row.id === data.examId && row.teacherId === activeUser.id);
    if (exam) {
      exam.questions = data.questions;
      exam.questionsPublished = true;
      examQuestionDraft = { examId: "", questions: "" };
    }
  }

  if (formType === "exam-submission") {
    const existing = db.examSubmissions.find((row) => row.examId === data.examId && row.studentId === activeUser.id);
    if (existing) {
      existing.answer = data.answer;
      existing.submittedAt = new Date().toISOString();
    } else {
      db.examSubmissions.push({ id: uid("sub"), examId: data.examId, studentId: activeUser.id, answer: data.answer, submittedAt: new Date().toISOString() });
    }
  }

  if (formType === "schedule") {
    db.schedules.push({ id: uid("sch"), ...data });
  }

  if (formType === "classroom") {
    db.classrooms.push({ id: uid("room"), capacity: Number(data.capacity), name: data.name, className: data.className });
  }

  if (formType === "user") {
    if (data.id) {
      const user = findUser(data.id);
      if (user) {
        user.name = data.name;
        user.role = data.role;
        user.className = data.className;
        user.subject = data.subject;
        user.roll = data.roll;
      }
      editingStudentId = null;
    } else {
      db.users.push({ id: uid(data.role.slice(0, 3)), ...data });
    }
  }

  if (formType === "activity") {
    db.activities.push({
      id: uid("act"),
      title: data.title,
      type: data.type,
      requestedBy: activeUser.id,
      status: "Pending",
      comment: "",
      description: data.description
    });
  }

  if (formType === "school") {
    if (data.id) {
      const school = findSchool(data.id);
      if (school) {
        school.name = data.name;
        school.upazila = data.upazila;
        school.session = data.session;
        school.headteacherId = data.headteacherId;
        assignHeadteacherToSchool(data.headteacherId, school.id);
      }
      editingSchoolId = null;
    } else {
      const school = { id: uid("school"), name: data.name, upazila: data.upazila, session: data.session, headteacherId: data.headteacherId };
      db.schools.push(school);
      assignHeadteacherToSchool(data.headteacherId, school.id);
    }
    db.school = db.schools[0];
  }

  persist(`Saved ${formType}.`);
}

function assignmentForm() {
  return `
    <form class="form-grid" data-form="assignment">
      <input name="title" placeholder="Assignment title" required>
      <input name="className" placeholder="Class name" value="${activeUser.className || "Class 5"}" required>
      <input name="dueDate" type="date" required>
      <textarea class="full" name="instructions" placeholder="Instructions for students" required></textarea>
      <button class="small-btn" type="submit">Create assignment</button>
    </form>
  `;
}

function assignmentMaterialForm() {
  const assignments = assignmentsForTeacher(activeUser.id);
  const assignmentOptions = assignments
    .map((assignment) => `<option value="${escapeHtml(assignment.id)}">${escapeHtml(assignment.title)}</option>`)
    .join("");
  const classroomOptions = db.classrooms
    .map((classroom) => `<option value="${escapeHtml(classroom.id)}">${escapeHtml(classroom.name)} - ${escapeHtml(classroom.className)}</option>`)
    .join("");

  if (!materialBuilder.mode) {
    return `
      <div class="material-builder">
        <div class="builder-choice">
          <button class="small-btn" data-action="choose-material-mode" data-mode="Bangla Shobdho" type="button">Bangla Shobdho</button>
          <button class="small-btn" data-action="choose-material-mode" data-mode="English Letters" type="button">English Letters</button>
        </div>
      </div>
    `;
  }

  const tokens = materialTokenSets[materialBuilder.mode] || [];
  const selectedTokens = materialBuilder.tokens
    .map((token, index) => `
      <button class="token-chip selected" data-action="remove-material-token" data-index="${index}" type="button">
        ${escapeHtml(token)}
      </button>
    `)
    .join("");

  return `
    <form class="form-grid" data-form="assignment-material">
      <select name="assignmentId" required>
        <option value="">Select assignment</option>
        ${assignmentOptions}
      </select>
      <select name="classroomId" required>
        <option value="">Select classroom</option>
        ${classroomOptions}
      </select>
      <input name="date" type="date" required>
      <input name="time" type="time" required>
      <input name="wordSet" value="${escapeHtml(materialBuilder.mode)}" readonly>
      <input name="questions" type="hidden" value="${escapeHtml(materialBuilder.tokens.join("\n"))}">
      <div class="material-builder full">
        <div class="actions">
          <button class="small-btn" data-action="clear-material-builder" type="button">Change page</button>
        </div>
        <div class="token-grid">
          ${tokens.map((token) => `<button class="token-chip" data-action="add-material-token" data-token="${escapeHtml(token)}" type="button">${escapeHtml(token)}</button>`).join("")}
        </div>
        <div class="selected-panel">
          <strong>Selected for assignment</strong>
          <div class="token-grid selected-grid">
            ${selectedTokens || `<span class="muted-text">Click items above to add them.</span>`}
          </div>
        </div>
      </div>
      <button class="small-btn" type="submit">Publish materials</button>
    </form>
  `;
}

function examForm() {
  return `
    <form class="form-grid" data-form="exam">
      <input name="className" placeholder="Class name" value="${activeUser.className || "Class 5"}" required>
      <input name="subject" placeholder="Subject" value="${activeUser.subject || ""}" required>
      <input name="date" type="date" required>
      <input name="time" placeholder="Time" required>
      <textarea class="full" name="description" placeholder="Exam description" required></textarea>
      <button class="small-btn" type="submit">Request exam</button>
    </form>
  `;
}

function examQuestionForm() {
  const approvedExams = db.exams.filter((exam) => exam.teacherId === activeUser.id && exam.status === "Approved");
  const selectedExamId = examQuestionDraft.examId || approvedExams[0]?.id || "";
  const options = approvedExams
    .map((exam) => `<option value="${escapeHtml(exam.id)}" ${exam.id === selectedExamId ? "selected" : ""}>${escapeHtml(exam.subject)} - ${escapeHtml(exam.className)} - ${escapeHtml(exam.date)}</option>`)
    .join("");

  return `
    <form class="form-grid" data-form="exam-question">
      <select name="examId" required>
        <option value="">Select approved exam</option>
        ${options}
      </select>
      <button class="small-btn" data-action="generate-exam-question" type="button">Generate exam question</button>
      <textarea class="full" name="questions" placeholder="Generated questions will appear here" required>${escapeHtml(examQuestionDraft.questions)}</textarea>
      <button class="small-btn" type="submit">Publish questions</button>
    </form>
  `;
}

function scheduleForm() {
  return `
    <form class="form-grid" data-form="schedule">
      <select name="teacherId" required>${db.users.filter((user) => user.role === "teacher").map((teacher) => `<option value="${teacher.id}">${teacher.name}</option>`).join("")}</select>
      <input name="className" placeholder="Class name" required>
      <input name="subject" placeholder="Subject" required>
      <input name="day" type="date" aria-label="Day" required>
      <input name="time" placeholder="Time" required>
      <input name="room" placeholder="Room" required>
      <button class="small-btn" type="submit">Add schedule</button>
    </form>
  `;
}

function classroomForm() {
  return `
    <form class="form-grid" data-form="classroom">
      <input name="name" placeholder="Room name" required>
      <input name="className" placeholder="Class name" required>
      <input name="capacity" type="number" min="1" placeholder="Capacity" required>
      <button class="small-btn" type="submit">Add classroom</button>
    </form>
  `;
}

function userForm(defaultRole = "teacher", lockRole = false, selectedUser = null) {
  const role = selectedUser?.role || defaultRole;
  const submitLabel = selectedUser ? "Update student" : lockRole ? "Add Student" : "Add user";
  return `
    <form class="form-grid" data-form="user">
      ${selectedUser ? `<input name="id" type="hidden" value="${escapeHtml(selectedUser.id)}">` : ""}
      <input name="name" placeholder="Full name" value="${escapeHtml(selectedUser?.name || "")}" required>
      ${lockRole ? `<input name="role" type="hidden" value="${role}">` : `<select name="role">
        ${Object.entries(roleLabels).map(([roleKey, label]) => `<option value="${roleKey}" ${roleKey === role ? "selected" : ""}>${label}</option>`).join("")}
      </select>`}
      <input name="className" placeholder="Class name" value="${escapeHtml(selectedUser?.className || "")}">
      <input name="subject" placeholder="Subject" value="${escapeHtml(selectedUser?.subject || "")}">
      <input name="roll" placeholder="Roll" value="${escapeHtml(selectedUser?.roll || "")}">
      <button class="small-btn" type="submit">${submitLabel}</button>
    </form>
  `;
}

function activityForm() {
  return `
    <form class="form-grid" data-form="activity">
      <input name="title" placeholder="Activity title" required>
      <input name="type" placeholder="Activity type" value="School Event" required>
      <textarea class="full" name="description" placeholder="Activity details" required></textarea>
      <button class="small-btn" type="submit">Add activity</button>
    </form>
  `;
}

function schoolForm(selectedSchool = null) {
  const headteacherOptions = db.users
    .filter((user) => user.role === "headteacher")
    .map((headteacher) => `<option value="${headteacher.id}" ${headteacher.id === selectedSchool?.headteacherId ? "selected" : ""}>${escapeHtml(headteacher.name)}</option>`)
    .join("");
  const submitLabel = selectedSchool ? "Update school" : "Add school";

  return `
    <form class="form-grid" data-form="school">
      ${selectedSchool ? `<input name="id" type="hidden" value="${escapeHtml(selectedSchool.id)}">` : ""}
      <input name="name" placeholder="School name" value="${escapeHtml(selectedSchool?.name || "")}" required>
      <input name="upazila" placeholder="Upazila" value="${escapeHtml(selectedSchool?.upazila || "")}" required>
      <input name="session" placeholder="Session" value="${escapeHtml(selectedSchool?.session || "")}" required>
      <select name="headteacherId" required>
        <option value="">Assign headteacher</option>
        ${headteacherOptions}
      </select>
      <button class="small-btn" type="submit">${submitLabel}</button>
    </form>
  `;
}

function editableScheduleTable() {
  return table(["Teacher", "Class", "Subject", "Day", "Time", "Room", "Action"], db.schedules.map((row) => [
    userName(row.teacherId),
    row.className,
    row.subject,
    row.day,
    row.time,
    row.room,
    `<div class="actions">
      <button class="small-btn" data-action="update-schedule" data-id="${row.id}" type="button">Edit</button>
      <button class="small-btn warning" data-action="delete-schedule" data-id="${row.id}" type="button">Delete</button>
    </div>`
  ]));
}

function scheduleTable(rows) {
  return table(["Teacher", "Class", "Subject", "Day", "Time", "Room"], rows.map((row) => [
    userName(row.teacherId),
    row.className,
    row.subject,
    row.day,
    row.time,
    row.room
  ]));
}

function assignmentList(rows) {
  if (!rows.length) return `<div class="empty-state">No assignment found.</div>`;
  return `<div class="list">${rows.map((row) => item(row.title, `${row.instructions}<br>Due: ${row.dueDate}`, row.className)).join("")}</div>`;
}

function assignmentMaterialTable(rows) {
  return table(["Assignment", "Classroom", "Date", "Time", "Page", "Selected items", "Status"], rows.map((row) => [
    assignmentTitle(row.assignmentId),
    classroomName(row.classroomId),
    row.date,
    row.time,
    row.wordSet,
    escapeHtml(row.questions).replaceAll("\n", "<br>"),
    statusBadge(row.status)
  ]));
}

function examTable(rows, canApprove = false) {
  return table(["Class", "Subject", "Description", "Date", "Time", "Status", "Action"], rows.map((row) => [
    row.className,
    row.subject,
    row.description || "-",
    row.date,
    row.time,
    statusBadge(row.status),
    canApprove && row.status === "Pending approval" ? `
      <div class="actions">
        <button class="small-btn" data-action="approve-exam" data-id="${row.id}" type="button">Approve</button>
        <button class="small-btn warning" data-action="reject-exam" data-id="${row.id}" type="button">Reject</button>
      </div>
    ` : ""
  ]));
}

function examQuestionTable(rows) {
  return table(["Class", "Subject", "Date", "Questions", "Status"], rows.map((row) => [
    row.className,
    row.subject,
    row.date,
    escapeHtml(row.questions).replaceAll("\n", "<br>"),
    row.started ? statusBadge("Started") : statusBadge("Published")
  ]));
}

function activeExamTable(rows) {
  return table(["Class", "Subject", "Date", "Time", "Status", "Action"], rows.map((row) => [
    row.className,
    row.subject,
    row.date,
    row.time,
    row.started ? statusBadge("Started") : statusBadge("Ready"),
    row.started ? "" : `<button class="small-btn" data-action="start-exam" data-id="${row.id}" type="button">Start Exam</button>`
  ]));
}

function studentExamList(rows) {
  if (!rows.length) return `<div class="empty-state">No exam is available yet.</div>`;
  return `<div class="list">${rows.map((exam) => `
    <form class="list-item" data-form="exam-submission">
      <div>
        <strong>${escapeHtml(exam.subject)} - ${escapeHtml(exam.className)}</strong>
        <p>${escapeHtml(exam.questions).replaceAll("\n", "<br>")}</p>
        <input name="examId" type="hidden" value="${escapeHtml(exam.id)}">
        <textarea name="answer" placeholder="Write your answer" required>${escapeHtml(examSubmissionForStudent(exam.id, activeUser.id)?.answer || "")}</textarea>
      </div>
      <button class="small-btn" type="submit">Submit exam</button>
    </form>
  `).join("")}</div>`;
}

function resultTable(rows) {
  return table(["Subject", "Marks", "Grade"], rows.map((row) => [row.subject, row.marks, row.grade]));
}

function attendanceTable(rows) {
  return table(["Name", "Role", "Date", "Status", "Taken by"], rows.map((row) => [
    userName(row.userId),
    roleLabels[row.role] || row.role,
    row.date,
    statusBadge(row.status),
    row.takenBy === "self" ? "Self" : userName(row.takenBy)
  ]));
}

function userAttendanceButtons(users, role) {
  return `<div class="list">${users.map((user) => `
    <div class="list-item">
      <div><strong>${user.name}</strong><p>${user.className || user.subject || roleLabels[user.role]}</p></div>
      <div class="actions">
        <button class="small-btn" data-action="mark-present" data-id="${user.id}" data-role="${role}" type="button">Present</button>
        <button class="small-btn warning" data-action="mark-absent" data-id="${user.id}" data-role="${role}" type="button">Absent</button>
      </div>
    </div>
  `).join("")}</div>`;
}

function classroomTable() {
  return table(["Room", "Class", "Capacity", "Action"], db.classrooms.map((room) => [
    room.name,
    room.className,
    room.capacity,
    `<div class="actions">
      <button class="small-btn" data-action="update-room" data-id="${room.id}" type="button">Edit</button>
      <button class="small-btn warning" data-action="delete-room" data-id="${room.id}" type="button">Delete</button>
    </div>`
  ]));
}

function schoolTable() {
  return table(["School", "Upazila", "Session", "Headteacher", "Action"], db.schools.map((school) => [
    school.name,
    school.upazila,
    school.session,
    school.headteacherId ? userName(school.headteacherId) : "-",
    `<button class="small-btn" data-action="update-school" data-id="${school.id}" type="button">Edit</button>`
  ]));
}

function userTable(users) {
  return table(["Name", "Role", "Class", "Subject", "Roll", "Action"], users.map((user) => [
    user.name,
    roleLabels[user.role],
    user.className || "-",
    user.subject || "-",
    user.roll || "-",
    `<div class="actions">
      <button class="small-btn" data-action="update-user" data-id="${user.id}" type="button">Edit</button>
      ${user.id === activeUser.id ? "" : `<button class="small-btn warning" data-action="delete-user" data-id="${user.id}" type="button">Delete</button>`}
    </div>`
  ]));
}

function activityTable(activities) {
  return table(["Activity", "Type", "Requested by", "Status", "Comment", "Action"], activities.map((activity) => [
    activity.title,
    activity.type,
    userName(activity.requestedBy),
    statusBadge(activity.status),
    activity.comment || "-",
    activeUser.role === "upo" && userRole(activity.requestedBy) === "headteacher" && activity.status === "Pending" ? `
      <div class="actions">
        <button class="small-btn" data-action="approve-activity" data-id="${activity.id}" type="button">Approve</button>
        <button class="small-btn warning" data-action="reject-activity" data-id="${activity.id}" type="button">Reject</button>
      </div>
    ` : ""
  ]));
}

function table(headers, rows) {
  if (!rows.length) return `<div class="empty-state">No records found.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function list(rows) {
  return `<div class="list">${rows.join("")}</div>`;
}

function item(title, copy, badgeText) {
  return `<div class="list-item"><div><strong>${title}</strong><p>${copy}</p></div><span class="badge">${badgeText}</span></div>`;
}

function stat(label, value) {
  return `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;
}

function markAttendance(userId, role, status, takenBy) {
  const today = todayIso();
  const existing = db.attendance.find((row) => row.userId === userId && row.date === today);
  if (existing) {
    existing.status = status;
    existing.takenBy = takenBy;
  } else {
    db.attendance.push({ id: uid("att"), userId, role, date: today, status, takenBy });
  }
  persist(`Attendance marked ${status.toLowerCase()}.`);
}

function chooseMaterialMode(mode) {
  materialBuilder.mode = mode;
  materialBuilder.tokens = [];
  renderApp();
}

function addMaterialToken(token) {
  if (!token) return;
  materialBuilder.tokens.push(token);
  renderApp();
}

function removeMaterialToken(index) {
  if (!Number.isInteger(index)) return;
  materialBuilder.tokens.splice(index, 1);
  renderApp();
}

function clearMaterialBuilder(shouldRender = true) {
  materialBuilder = {
    mode: null,
    tokens: []
  };
  if (shouldRender) renderApp();
}

function generateExamQuestion(button) {
  const form = button.closest("form");
  const data = Object.fromEntries(new FormData(form).entries());
  const exam = db.exams.find((row) => row.id === data.examId && row.teacherId === activeUser.id);
  if (!exam) {
    showNotice("Please select an approved exam.");
    return;
  }

  examQuestionDraft = {
    examId: exam.id,
    questions: buildExamQuestions(exam)
  };
  renderApp();
}

function buildExamQuestions(exam) {
  const description = exam.description || `${exam.subject} exam`;
  return [
    `1. Explain the main idea of: ${description}`,
    `2. Write five key points about ${exam.subject}.`,
    `3. Give one example from your class work.`,
    `4. Answer in complete sentences.`,
    `5. Review your answer before submitting.`
  ].join("\n");
}

function startExam(id) {
  const exam = db.exams.find((row) => row.id === id && row.teacherId === activeUser.id);
  if (!exam) return;

  exam.started = true;
  persist("Exam started.");
}

function updateStatus(collection, id, status) {
  const row = db[collection].find((item) => item.id === id);
  if (row) row.status = status;
  persist(`Status updated to ${status}.`);
}

function updateSchedule(id) {
  const row = db.schedules.find((schedule) => schedule.id === id);
  if (!row) return;

  const subject = prompt("Subject", row.subject);
  if (subject === null) return;
  const day = prompt("Day", row.day);
  if (day === null) return;
  const time = prompt("Time", row.time);
  if (time === null) return;
  const room = prompt("Room", row.room);
  if (room === null) return;

  row.subject = subject.trim() || row.subject;
  row.day = day.trim() || row.day;
  row.time = time.trim() || row.time;
  row.room = room.trim() || row.room;
  persist("Schedule updated.");
}

function updateClassroom(id) {
  const row = db.classrooms.find((room) => room.id === id);
  if (!row) return;

  const name = prompt("Room name", row.name);
  if (name === null) return;
  const className = prompt("Class name", row.className);
  if (className === null) return;
  const capacity = prompt("Capacity", row.capacity);
  if (capacity === null) return;

  row.name = name.trim() || row.name;
  row.className = className.trim() || row.className;
  row.capacity = Number(capacity) || row.capacity;
  persist("Classroom updated.");
}

function editSchool(id) {
  editingSchoolId = id;
  renderApp();
}

function editUser(id) {
  const row = findUser(id);
  if (activeUser.role === "headteacher" && row?.role === "student") {
    editingStudentId = id;
    renderApp();
    return;
  }

  updateUser(id);
}

function updateUser(id) {
  const row = findUser(id);
  if (!row) return;

  const name = prompt("Full name", row.name);
  if (name === null) return;
  const role = activeUser.role === "headteacher" && row.role === "student" ? row.role : prompt("Role", row.role);
  if (role === null) return;
  const className = prompt("Class name", row.className || "");
  if (className === null) return;
  const subject = prompt("Subject", row.subject || "");
  if (subject === null) return;
  const roll = prompt("Roll", row.roll || "");
  if (roll === null) return;

  row.name = name.trim() || row.name;
  row.role = roleLabels[role] ? role : row.role;
  row.className = className.trim();
  row.subject = subject.trim();
  row.roll = roll.trim();
  persist("User updated.");
}

function rejectActivity(id) {
  const row = db.activities.find((activity) => activity.id === id);
  if (!row) return;

  const comment = prompt("Rejection comment", row.comment || "");
  if (comment === null) return;

  row.status = "Rejected";
  row.comment = comment.trim() || "No comment provided.";
  persist("Activity rejected.");
}

function removeById(collection, id) {
  db[collection] = db[collection].filter((row) => row.id !== id);
  persist("Record deleted.");
}

function persist(message) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  showNotice(message);
  renderApp();
}

function showNotice(message) {
  els.notice.textContent = message;
  els.notice.hidden = false;
  window.setTimeout(() => {
    els.notice.hidden = true;
  }, 2400);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "digital-schooling-data.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function resetData() {
  localStorage.removeItem(STORAGE_KEY);
  db = await loadDatabase();
  showNotice("Demo data restored from JSON.");
  renderApp();
}

function logout() {
  sessionStorage.removeItem("activeUserId");
  window.location.href = "index.html";
}

function findUser(id) {
  return db.users.find((user) => user.id === id);
}

function userName(id) {
  return findUser(id)?.name || id;
}

function findSchool(id) {
  return db.schools.find((school) => school.id === id);
}

function activeSchool() {
  const activeSchoolId = sessionStorage.getItem("activeSchoolId");
  return findSchool(activeSchoolId) || findSchool(activeUser?.schoolId) || db.schools[0];
}

function schoolForHeadteacher(headteacherId) {
  if (!headteacherId) return [];
  return db.schools.filter((school) => school.headteacherId === headteacherId);
}

function assignHeadteacherToSchool(headteacherId, schoolId) {
  if (!headteacherId) return;
  const headteacher = findUser(headteacherId);
  if (headteacher) headteacher.schoolId = schoolId;
}

function schoolUsers(schoolId) {
  return db.users.filter((user) => user.schoolId === schoolId);
}

function performanceGraph() {
  const rows = db.schools.map((school) => {
    const userIds = schoolUsers(school.id).map((user) => user.id);
    const teacherIds = schoolUsers(school.id).filter((user) => user.role === "teacher").map((user) => user.id);
    const studentIds = schoolUsers(school.id).filter((user) => user.role === "student").map((user) => user.id);
    const teacherAttendance = percentage(
      db.attendance.filter((row) => teacherIds.includes(row.userId) && row.status === "Present").length,
      db.attendance.filter((row) => teacherIds.includes(row.userId)).length
    );
    const resultAverage = average(db.results.filter((result) => studentIds.includes(result.studentId)).map((result) => Number(result.marks)));
    const performance = Math.round((teacherAttendance + resultAverage) / 2);

    return `
      <div class="graph-row">
        <div>
          <strong>${escapeHtml(school.name)}</strong>
          <span>Teacher attendance ${teacherAttendance}% | Student results ${resultAverage}%</span>
        </div>
        <div class="bar-track"><span style="width: ${performance}%"></span></div>
        <strong>${performance}%</strong>
      </div>
    `;
  }).join("");

  return `<div class="performance-graph">${rows || `<div class="empty-state">No school performance data yet.</div>`}</div>`;
}

function averageStudentResult() {
  return average(db.results.map((result) => Number(result.marks)));
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function percentage(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function teacherForExam(database, exam) {
  const activity = database.activities?.find((row) => row.type === "Exam" && row.title === `${exam.className} ${exam.subject} exam`);
  if (activity && findUserInDatabase(database, activity.requestedBy)?.role === "teacher") return activity.requestedBy;
  const teacher = database.users.find((user) => user.role === "teacher" && (user.subject === exam.subject || user.className === exam.className));
  return teacher?.id || "";
}

function findUserInDatabase(database, id) {
  return database.users.find((user) => user.id === id);
}

function userRole(id) {
  return findUser(id)?.role || "";
}

function activitiesForHeadteacher(headteacherId) {
  return db.activities.filter((activity) => activity.requestedBy === headteacherId);
}

function schedulesForTeacher(teacherId) {
  return db.schedules.filter((schedule) => schedule.teacherId === teacherId);
}

function schedulesForClass(className) {
  return db.schedules.filter((schedule) => schedule.className === className);
}

function assignmentsForTeacher(teacherId) {
  return db.assignments.filter((assignment) => assignment.teacherId === teacherId);
}

function examsForTeacher(teacherId) {
  return db.exams.filter((exam) => exam.teacherId === teacherId);
}

function readyExamsForTeacher(teacherId) {
  return db.exams.filter((exam) => exam.teacherId === teacherId && exam.status === "Approved" && exam.questionsPublished);
}

function questionedExamsForTeacher(teacherId) {
  return readyExamsForTeacher(teacherId);
}

function assignmentMaterialsForTeacher(teacherId) {
  return db.assignmentMaterials.filter((material) => material.teacherId === teacherId);
}

function assignmentTitle(id) {
  return db.assignments.find((assignment) => assignment.id === id)?.title || id;
}

function classroomName(id) {
  const classroom = db.classrooms.find((room) => room.id === id);
  return classroom ? `${classroom.name} - ${classroom.className}` : id;
}

function assignmentsForStudent(student) {
  return db.assignments.filter((assignment) => assignment.className === student.className);
}

function examsForClass(className) {
  return db.exams.filter((exam) => exam.className === className);
}

function availableExamsForStudent(student) {
  return db.exams.filter((exam) => (
    exam.className === student.className &&
    exam.status === "Approved" &&
    exam.questionsPublished &&
    exam.started &&
    hasExamTimeStarted(exam)
  ));
}

function hasExamTimeStarted(exam) {
  const startsAt = parseExamDateTime(exam.date, exam.time);
  return startsAt ? startsAt.getTime() <= Date.now() : false;
}

function parseExamDateTime(date, time) {
  if (!date || !time) return null;
  const trimmedTime = String(time).trim();
  const isoMatch = trimmedTime.match(/^(\d{2}):(\d{2})$/);
  if (isoMatch) return new Date(`${date}T${trimmedTime}:00`);

  const twelveHour = trimmedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!twelveHour) return new Date(`${date}T00:00:00`);

  let hours = Number(twelveHour[1]);
  const minutes = twelveHour[2];
  const meridiem = twelveHour[3].toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return new Date(`${date}T${String(hours).padStart(2, "0")}:${minutes}:00`);
}

function examSubmissionForStudent(examId, studentId) {
  return db.examSubmissions.find((submission) => submission.examId === examId && submission.studentId === studentId);
}

function nextClassForStudent(student) {
  return schedulesForClass(student.className)[0];
}

function todaysAttendance() {
  return db.attendance.filter((row) => row.date === todayIso());
}

function hasAttendanceToday(userId) {
  return db.attendance.some((row) => row.userId === userId && row.date === todayIso() && row.status === "Present");
}

function statusBadge(status) {
  const className = status === "Present" || status === "Approved" ? "green" : status === "Absent" || status === "Rejected" ? "red" : "";
  return `<span class="badge ${className}">${status}</span>`;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
