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
app.get("/api/questions", async (req, res) => {
    const status = req.query.status || "active";

    try {
        const rows = await db("questions").where({ status });
        res.json({ questions: rows });

    } catch (error) {
        console.error("Error fetching questions:", error);
        res.status(500).json({ error: "Failed to load questions." });
    }
});


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
                professor
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
        await db("answers").insert({
            doubt_id,
            answer_text,
            answered_by
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