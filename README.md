# Digital Schooling System

A simple static web application built with only HTML, CSS, and JavaScript. It uses `data/db.json` as the initial data source, then stores edits in browser `localStorage`. Use **Download JSON** in the app to export the latest edited data.

## Demo Profiles

- Student: Ramiza Akter
- Teacher: Riza Akter
- Headteacher: Fahim Uddin
- UPO Admin: UPO Admin

## Features

- `index.html` is the login page
- Separate role pages: `student.html`, `teacher.html`, `headteacher.html`, `upo.html`
- Student attendance, classes, assignments, exams, and results
- Teacher attendance, schedules, assignment creation, student attendance, and exam requests
- Headteacher schedule add, edit, update, delete; teacher attendance, classrooms, students, and approvals
- UPO user management, attendance monitoring, school management, and approvals

## Run

Start a static server from this folder:

```powershell
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/index.html
```

Login with a demo profile. The app will redirect automatically:

- Student profiles go to `student.html`
- Teacher profiles go to `teacher.html`
- Headteacher profiles go to `headteacher.html`
- UPO profiles go to `upo.html`

Opening `index.html` directly may block JSON loading in some browsers, so a local server is recommended.
