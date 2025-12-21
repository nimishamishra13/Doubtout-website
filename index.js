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
    const questions = await db('doubts')
  .leftJoin('answers', 'doubts.doubt_id', 'answers.doubt_id')
  .leftJoin('users', 'answers.answered_by', 'users.user_id')
  .select(
    'doubts.doubt_id as question_id',
    'doubts.question',
    'doubts.course',
    'doubts.created_at as created_at',     // ✅ REQUIRED
    'answers.answer_text',
    'answers.created_at as answered_at',
    'users.full_name as answered_by_name'  // ✅ REQUIRED
  )
  .where('doubts.user_id', user_id)
  .orderBy('doubts.created_at', 'desc');

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

app.post('/api/practice/answer', async (req, res) => {
    const { doubt_id, student_id, answer_text } = req.body;
    await db('practice_answers').insert({ doubt_id, student_id, answer_text, status: 'pending' });
    res.json({ message: 'Practice answer submitted' });
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

/* ---------------- SERVER ---------------- */
async function startServer() {
    await connectDb();
    app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
}

startServer();