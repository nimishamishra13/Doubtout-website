const express = require('express');
const cors = require('cors');
const db = require('./db');
const { connectDb } = require('./db');
const { signUpUser, loginUser } = require('./authService');

const app = express();
const PORT = 3000;

/* ---------------- MIDDLEWARE ---------------- */
app.use(cors({ origin: '*'}));
app.use(express.json());

/* ---------------- AUTH ---------------- */
app.post('/api/signup', async (req, res) => {
    const { email, password, fullName, role, roleDetails } = req.body;
    if (!email || !password || !fullName || !role || !roleDetails) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        const newUser = await signUpUser(email, password, fullName, role, roleDetails);
        res.status(201).json({
            message: 'User successfully registered.',
            user: { user_id: newUser.user_id, email: newUser.email, role: newUser.role }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
        return res.status(400).json({ error: 'Missing credentials' });
    }

    try {
        const user = await loginUser(email, password, role);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        res.json({
            message: 'Login successful',
            user: { user_id: user.user_id, fullName: user.full_name, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

/* ---------------- DOUBTS ---------------- */
app.post('/api/doubts', async (req, res) => {
    let { user_id, branch, semester, course, question, professor } = req.body;

    if (!user_id || !question || !course || !semester || !branch) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    professor = professor ? Number(professor) : null;

    try {
        const [row] = await db('doubts')
            .insert({
                user_id,
                branch,
                semester,
                course,
                question,
                professor,
                status: 'pending'
            })
            .returning(['doubt_id']);

        res.status(201).json({ message: 'Doubt submitted', doubt_id: row.doubt_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to submit doubt' });
    }
});

app.get('/api/student/questions/:user_id', async (req, res) => {
  const user_id = req.params.user_id;

  try {
    const questions = await db('doubts')
      .leftJoin('answers', 'doubts.doubt_id', 'answers.doubt_id')
      .leftJoin('users', 'answers.answered_by', 'users.user_id')
      .select(
        'doubts.doubt_id as question_id',
        'doubts.question',
        'doubts.course',
        db.raw("TO_CHAR(doubts.created_at, 'YYYY-MM-DD') as asked_date"),
        'answers.answer_text',
        db.raw("TO_CHAR(answers.created_at, 'YYYY-MM-DD') as answered_date"),
        'users.full_name as answered_by_name'
      )
      .where('doubts.user_id', user_id)
      .orderBy('doubts.created_at', 'desc');

    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load student questions.' });
  }
});


/* ---------------- ANSWERS ---------------- */
app.post('/api/answers', async (req, res) => {
    const { doubt_id, answer_text, answered_by } = req.body;
    if (!doubt_id || !answer_text || !answered_by) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    try {
        await db.transaction(async trx => {
            await trx('answers').insert({ doubt_id, answer_text, answered_by });
            await trx('doubts').where({ doubt_id }).update({ status: 'answered' });
        });

        res.json({ message: 'Answer submitted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to submit answer' });
    }
});

/* ---------------- PROFESSORS ---------------- */
app.get('/api/professors', async (req, res) => {
    const professors = await db('users')
        .select('user_id', 'full_name')
        .where('role', 'professor');
    res.json({ professors });
});

/* ---------------- SUBJECTS ---------------- */
app.get('/api/subjects', async (req, res) => {
    const { department_id, semester } = req.query;
    if (!department_id || !semester) {
        return res.status(400).json({ error: 'department_id and semester required' });
    }

    const subjects = await db('subjects')
        .where({ department_id, semester })
        .orderBy('subject_name');

    res.json({ subjects });
});

/* ---------------- PRACTICE SESSION ---------------- */
app.get('/api/practice/questions', async (req, res) => {
    const { course, status } = req.query;

    let query = db('doubts')
        .leftJoin('answers', 'doubts.doubt_id', 'answers.doubt_id')
        .select('doubts.doubt_id', 'doubts.question', 'doubts.course', 'answers.answer_text')
        .where('doubts.course', course);

    if (status === 'answered') query.whereNotNull('answers.answer_text');
    if (status === 'unanswered') query.whereNull('answers.answer_text');

    const questions = await query.orderBy('doubts.created_at', 'desc');
    res.json({ questions });
});

app.post("/api/practice/answer", async (req, res) => {
    const { doubt_id, student_id, answer_text } = req.body;

    try {
        // find professor who owns this doubt
        const doubt = await db("doubts")
            .select("asked_by")
            .where({ doubt_id })
            .first();

        if (!doubt) {
            return res.status(404).json({ error: "Doubt not found" });
        }

        await db("practice_answers").insert({
            doubt_id,
            student_id,
            answer_text,
            status: "pending"
        });

        res.json({ message: "Submitted for professor review" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to submit practice answer" });
    }
});


/* ---------------- LEADERBOARD ---------------- */
app.get('/api/leaderboard', async (req, res) => {
    const leaderboard = await db('users')
        .select('user_id', 'full_name', 'points')
        .where('role', 'student')
        .orderBy('points', 'desc')
        .limit(5);

    res.json({ leaderboard });
});

/* ---------------- ANSWER ARCHIVE ---------------- */
app.get('/api/archive', async (req, res) => {
    const { semester, course, search } = req.query;

    let query = db('doubts')
        .join('answers', 'doubts.doubt_id', 'answers.doubt_id')
        .join('users', 'answers.answered_by', 'users.user_id')
        .select(
            'doubts.question',
            'doubts.course',
            'doubts.semester',
            'answers.answer_text',
            'users.full_name as answered_by'
        );

    if (semester) query.where('doubts.semester', semester);
    if (course) query.where('doubts.course', course);
    if (search) query.whereILike('doubts.question', `%${search}%`);

    res.json({ archive: await query });
});
// GET student contributions (approved answers)
// GET /api/student/contributions/:studentId
app.get("/api/student/contributions/:studentId", async (req, res) => {
    const { studentId } = req.params;

    try {
        const pending = await db("practice_answers")
            .where({ student_id: studentId, status: "pending" });

        const approved = await db("practice_answers")
            .join("users", "practice_answers.reviewed_by", "users.user_id")
            .select(
                "practice_answers.*",
                "users.full_name as professor_name"
            )
            .where({
                student_id: studentId,
                status: "approved"
            });

        res.json({
            pending_count: pending.length,
            approved_count: approved.length,
            approved_answers: approved
        });

    } catch (err) {
        res.status(500).json({ error: "Failed to load contributions" });
    }
});
app.post("/api/practice/approve", async (req, res) => {
    const { practice_answer_id, professor_id } = req.body;

    try {
        // 1. Approve answer
        const approveQuery = `
            UPDATE practice_answers
            SET status = 'approved',
                reviewed_by = $1,
                reviewed_at = NOW()
            WHERE practice_answer_id = $2
            RETURNING student_id;
        `;

        const result = await pool.query(approveQuery, [
            professor_id,
            practice_answer_id
        ]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Answer not found" });
        }

        const studentId = result.rows[0].student_id;

        // 2. Give points to student
        await pool.query(
            `UPDATE users SET points = points + 10 WHERE user_id = $1`,
            [studentId]
        );

        res.json({ message: "Answer approved and points awarded" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});
app.post("/api/professor/practice/review", async (req, res) => {
    const { practice_id, professor_id, action } = req.body;

    if (!["approved", "rejected"].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
    }

    try {
        await db("practice_answers")
            .where({ practice_id })
            .update({
                status: action,
                reviewed_by: professor_id,
                reviewed_at: db.fn.now()
            });

        res.json({ message: "Review updated" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update review" });
    }
});

app.get("/api/professor/answers/:professorId", async (req, res) => {
    const professorId = Number(req.params.professorId);

    try {
        const rows = await db("answers")
            .join("doubts", "answers.doubt_id", "doubts.doubt_id")
            .select(
                "answers.answer_id",
                "answers.answer_text",
                "answers.created_at as answered_at",
                "doubts.question",
                "doubts.course"
            )
            .where("answers.answered_by", professorId)
            .orderBy("answers.created_at", "desc");

        res.json({ answers: rows });
    } catch (err) {
        console.error("Professor answers error:", err);
        res.status(500).json({ error: "Failed to fetch answers" });
    }
});
app.get("/api/professor/practice/:professorId", async (req, res) => {
    const professorId = Number(req.params.professorId);

    try {
        const rows = await db("practice_answers")
            .join("doubts", "practice_answers.doubt_id", "doubts.doubt_id")
            .join("users", "practice_answers.student_id", "users.user_id")
            .select(
                "practice_answers.practice_id",
                "practice_answers.answer_text",
                "practice_answers.status",
                "doubts.question",
                "doubts.course",
                "users.name as student_name"
            )
            .where("doubts.asked_by", professorId)
            .andWhere("practice_answers.status", "pending");

        res.json({ practices: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch pending reviews" });
    }
});

/* ---------------- SERVER ---------------- */
async function startServer() {
    await connectDb();
    app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
}

startServer();