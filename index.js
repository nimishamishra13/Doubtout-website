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
// API Route: Sign Up (No changes)
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
app.get("/api/questions", async (req, res) => {
    const status = req.query.status || "active";

    try {
        const sql = "SELECT * FROM questions WHERE status = ?";
        const [rows] = await db.query(sql, [status]);

        res.json({ questions: rows });

    } catch (error) {
        console.error("Error fetching questions:", error);
        res.status(500).json({ error: "Failed to load questions." });
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

