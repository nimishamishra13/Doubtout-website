const express = require('express');
const cors = require('cors'); 
// Import 'db' for the API routes and '{ connectDb }' for the startup function
const db = require('./db'); 
const { connectDb } = require('./db');
const { signUpUser, loginUser } = require('./authService');


const app = express();
const PORT = 3000;

// --- CRITICAL Middleware Setup ---
const corsOptions = {
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', 
    allowedHeaders: 'Content-Type,Authorization', 
    preflightContinue: false,
    optionsSuccessStatus: 204
};
app.use(cors(corsOptions)); 
app.use(express.json()); 

// ----------------------------------------------------------------------
// API Route: Sign Up
// ----------------------------------------------------------------------
app.post('/api/signup', async (req, res) => {
    const { email, password, fullName, role, roleDetails } = req.body;

    if (!email || !password || !fullName || !role || !roleDetails) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        const newUser = await signUpUser(email, password, fullName, role, roleDetails);

        return res.status(201).json({ 
            message: 'User successfully registered. Please log in.',
            user: { user_id: newUser.user_id, email: newUser.email, role: newUser.role }
        });

    } catch (error) {
        if (error.message.includes('already in use')) {
            return res.status(409).json({ error: error.message });
        }
        console.error('Registration failed:', error.message);
        return res.status(500).json({ error: 'Server error during registration.' });
    }
});

// ----------------------------------------------------------------------
// API Route: Login
// ----------------------------------------------------------------------
app.post('/api/login', async (req, res) => {
    const { email, password, role } = req.body; 

    // CRITICAL DEBUG LOGGING 
    console.log(`[REQ] Login attempt at ${new Date().toISOString()}`);
    console.log(`[DEBUG] Received body:`, req.body); 

    if (!email || !password || !role) {
        console.log(`[ERROR] Missing required field(s). email: ${email}, password: ${password ? 'present' : 'missing'}, role: ${role}`);
        return res.status(400).json({ error: 'Email, password, and role are required.' });
    }

    try {
        const user = await loginUser(email, password, role);

        if (user) {
            const token = `generated_token_for_${user.user_id}`;
            console.log(`[SUCCESS] Login successful for user: ${user.user_id}`);
            
            return res.status(200).json({ 
                message: 'Login successful.',
                token: token,
                user: { user_id: user.user_id, fullName: user.full_name, role: user.role }
            });
        } else {
            console.log(`[FAIL] Authentication failed for ${email}. Invalid credentials.`);
            return res.status(401).json({ error: 'Invalid Email or password.' });
        }
    } catch (error) {
        console.error('[ERROR] Server error during login:', error.message, error.stack);
        return res.status(500).json({ error: 'Server error during login. Check server logs.' });
    }
});
// ----------------------------------------------------------------------
// API Route: Get Questions
// ----------------------------------------------------------------------



// ----------------------------------------------------------------------
// API Route: Submit Doubt (Fixed for SQL syntax)
// ----------------------------------------------------------------------
app.post('/api/doubts', async (req, res) => {
    let { user_id, branch, semester, course, question, professor } = req.body;

    if (!user_id || !question) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    // Normalize professor value
    if (!professor || professor === "" || professor === "null") {
        professor = null;
    } else {
        professor = Number(professor);
    }

    try {
        const inserted = await db("doubts")
            .insert({
                user_id,
                branch,
                semester,
                course,
                question,
                professor,
                status: "pending"   // ✅ correct
            })
            .returning(["doubt_id"]);

        res.status(201).json({
            message: "Doubt submitted successfully",
            doubt_id: inserted[0].doubt_id
        });
    } catch (err) {
        console.error("Error inserting doubt:", err);
        res.status(500).json({ error: "Server error inserting doubt." });
    }
});




app.get("/api/professors", async (req, res) => {
    try {
        const professors = await db("users")
            .select("user_id", "full_name")
            .where("role", "professor");

        res.json({ professors });
    } catch (err) {
        console.error("Error fetching professors:", err);
        res.status(500).json({ error: "Failed to fetch professors" });
    }
});

// GET /api/student/questions/:user_id
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
        'doubts.created_at',
        'answers.answer_text',
        'answers.created_at as answered_at',
        'users.full_name as answered_by_name'
      )
      .where('doubts.user_id', user_id)
      .orderBy('doubts.created_at', 'desc');

    res.json({ questions });
  } catch (err) {
    console.error('Error fetching user questions:', err);
    res.status(500).json({ error: 'Failed to load student questions.' });
  }
});



app.get("/api/professor/doubts/:professorId", async (req, res) => {
    const professorId = Number(req.params.professorId);

    try {
        const doubts = await db("doubts")
            .leftJoin("answers", "doubts.doubt_id", "answers.doubt_id")
            .select(
                "doubts.doubt_id",
                "doubts.question",
                "doubts.course",
                "doubts.created_at",
                "doubts.professor",
                "answers.answer_text"
            )
            .where(builder => {
                builder
                    .whereNull("doubts.professor")      // common doubts
                    .orWhere("doubts.professor", professorId); // assigned doubts
            })
            .whereNull("answers.answer_id") // unanswered only
            .orderBy("doubts.created_at", "desc");

        res.json({ doubts });
    } catch (err) {
        console.error("Error fetching professor doubts:", err);
        res.status(500).json({ error: "Failed to fetch doubts" });
    }
});
app.post("/api/answers", async (req, res) => {
    const { doubt_id, answer_text, answered_by } = req.body;

    if (!doubt_id || !answer_text || !answered_by) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {
        await db.transaction(async trx => {
            await trx("answers").insert({
                doubt_id,
                answer_text,
                answered_by
            });

            // ✅ update doubt status only now
            await trx("doubts")
                .where({ doubt_id })
                .update({ status: "answered" });
        });

        res.status(201).json({ message: "Answer submitted successfully" });
    } catch (err) {
        console.error("Error saving answer:", err);
        res.status(500).json({ error: "Failed to submit answer" });
    }
});

// ----------------------------------------------------------------------
// API: Get answers by specific professor
// ----------------------------------------------------------------------
app.get("/api/professor/answers/:professorId", async (req, res) => {
    const { professorId } = req.params;

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
        console.error("Error fetching professor answers:", err);
        res.status(500).json({ error: "Failed to fetch professor answers" });
    }
});
app.get("/api/practice/questions", async (req, res) => {
    const { course, topic, status } = req.query;

    try {
        let query = db("doubts")
            .leftJoin("answers", "doubts.doubt_id", "answers.doubt_id")
            .select(
                "doubts.doubt_id",
                "doubts.question",
                "doubts.course",
                "doubts.status",
                "answers.answer_text"
            );

        if (course) query.where("doubts.course", course);
        if (status === "answered") query.whereNotNull("answers.answer_text");
        if (status === "unanswered") query.whereNull("answers.answer_text");

        const questions = await query.orderBy("doubts.created_at", "desc");

        res.json({ questions });
    } catch (err) {
        console.error("Practice fetch error:", err);
        res.status(500).json({ error: "Failed to load practice questions" });
    }
});
app.post("/api/practice/answer", async (req, res) => {
    const { doubt_id, student_id, answer_text } = req.body;

    if (!doubt_id || !student_id || !answer_text) {
        return res.status(400).json({ error: "Missing fields" });
    }

    try {
        await db("practice_answers").insert({
            doubt_id,
            student_id,
            answer_text
        });

        res.status(201).json({ message: "Practice answer submitted for review" });
    } catch (err) {
        console.error("Practice submit error:", err);
        res.status(500).json({ error: "Failed to submit practice answer" });
    }
});
app.get("/api/professor/practice/:professorId", async (req, res) => {
    try {
        const rows = await db("practice_answers")
            .join("doubts", "practice_answers.doubt_id", "doubts.doubt_id")
            .join("users", "practice_answers.student_id", "users.user_id")
            .select(
                "practice_answers.practice_id",
                "practice_answers.answer_text",
                "practice_answers.status",
                "doubts.question",
                "doubts.status as doubt_status",
                "users.full_name as student_name"
            )
            .where("practice_answers.status", "pending")
            .orderBy("practice_answers.created_at", "desc");

        res.json({ practices: rows });
    } catch (err) {
        console.error("Practice review fetch error:", err);
        res.status(500).json({ error: "Failed to fetch practice answers" });
    }
});
app.post("/api/practice/review", async (req, res) => {
    const { practice_id, status, publish, professor_id } = req.body;

    try {
        // Get practice submission
        const practice = await db("practice_answers")
            .where({ practice_id })
            .first();

        if (!practice) {
            return res.status(404).json({ error: "Practice not found" });
        }

        // Update practice status
        await db("practice_answers")
            .where({ practice_id })
            .update({
                status,
                reviewed_by: professor_id,
                reviewed_at: db.fn.now()
            });

        // ✅ AWARD POINTS IF CORRECT
        if (status === "correct") {
            await db("users")
                .where({ user_id: practice.student_id })
                .increment("points", 100);
        }

        // Publish answer if required
        if (publish === true) {
            await db("answers").insert({
                doubt_id: practice.doubt_id,
                answer_text: practice.answer_text,
                answered_by: practice.student_id
            });

            await db("doubts")
                .where({ doubt_id: practice.doubt_id })
                .update({ status: "answered" });
        }

        res.json({ message: "Review processed successfully" });

    } catch (err) {
        console.error("Practice review error:", err);
        res.status(500).json({ error: "Failed to review practice answer" });
    }
});
app.get("/api/leaderboard", async (req, res) => {
    try {
        const leaderboard = await db("users")
            .select("user_id", "full_name", "points")
            .where("role", "student")
            .orderBy("points", "desc")
            .limit(5);

        res.json({ leaderboard });
    } catch (err) {
        console.error("Leaderboard error:", err);
        res.status(500).json({ error: "Failed to load leaderboard" });
    }
});

// GET /api/archive
// ----------------------------------------------------------------------
// API: Answer Archive (only answered doubts)
// ----------------------------------------------------------------------
app.get("/api/archive", async (req, res) => {
    const { semester, course, search } = req.query;

    try {
        let query = db("doubts")
            .join("answers", "doubts.doubt_id", "answers.doubt_id")
            .join("users", "answers.answered_by", "users.user_id")
            .select(
                "doubts.doubt_id",
                "doubts.question",
                "doubts.course",
                "doubts.semester",
                "answers.answer_text",
                "users.full_name as answered_by"
            )
            .orderBy("answers.created_at", "desc");

        if (semester) {
            query = query.where("doubts.semester", semester);
        }

        if (course) {
            query = query.where("doubts.course", course);
        }

        if (search) {
            query = query.whereILike("doubts.question", `%${search}%`);
        }

        const results = await query;
        res.json({ archive: results });

    } catch (err) {
        console.error("Error fetching archive:", err);
        res.status(500).json({ error: "Failed to load archive" });
    }
});
// Get subjects by department + semester
app.get("/api/subjects", async (req, res) => {
    const { department_id, semester } = req.query;

    if (!department_id || !semester) {
        return res.status(400).json({ error: "department_id and semester required" });
    }

    try {
        const subjects = await db("subjects")
            .select("subject_id", "subject_name")
            .where({ department_id, semester })
            .orderBy("subject_name");

        res.json({ subjects });
    } catch (err) {
        console.error("Error fetching subjects:", err);
        res.status(500).json({ error: "Failed to fetch subjects" });
    }
});
// ----------------------------------------------------------------------
// API: Practice Session Questions
// ----------------------------------------------------------------------
app.get("/api/practice/questions", async (req, res) => {
    const { course, status } = req.query;

    try {
        let query = db("doubts")
            .leftJoin("answers", "doubts.doubt_id", "answers.doubt_id")
            .select(
                "doubts.doubt_id",
                "doubts.question",
                "doubts.course",
                "answers.answer_text"
            )
            .where("doubts.course", course);

        if (status === "answered") {
            query = query.whereNotNull("answers.answer_text");
        }

        if (status === "unanswered") {
            query = query.whereNull("answers.answer_text");
        }

        const questions = await query.orderBy("doubts.created_at", "desc");

        res.json({ questions });
    } catch (err) {
        console.error("Practice session error:", err);
        res.status(500).json({ error: "Failed to load practice questions" });
    }
});




/**
 * Main function to connect to the database and then start the server.
 */
async function startServer() {
    try {
        // This will now correctly call the function exported from db.js
        await connectDb(); 
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });

    } catch (e) {
        console.error('🛑 Application failed to start. Database connection error.', e.message);
        process.exit(1);
    }
}

startServer();