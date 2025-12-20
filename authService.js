const db = require('./db');
const bcrypt = require('bcryptjs');

const saltRounds = 10;

/**
 * Signs up a new user, hashes the password, and inserts basic details into the 'users' table.
 * Role-specific details (like major/studentId) are currently ignored to fix the schema error.
 * In a future step, these details should be stored in a separate, dedicated table.
 * * @param {string} email - User's email (must be unique).
 * @param {string} password - User's plain-text password.
 * @param {string} fullName - User's full name.
 * @param {string} role - User's role (e.g., 'student', 'teacher').
 * @param {object} roleDetails - Object containing role-specific data (e.g., { major, studentIdNumber }).
 * @returns {object} The newly created user's basic details.
 */
async function signUpUser(email, password, fullName, role, roleDetails) {
    try {
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 1. Check if the user already exists
        const existingUser = await db('users').where({ email }).first();
        if (existingUser) {
            throw new Error(`User with email '${email}' is already in use.`);
        }

        // 2. Insert only the generic columns that exist in the 'users' table.
        // We explicitly omit 'major' and 'studentIdNumber' to fix the database error.
        const [newUser] = await db('users')
            .insert({
                email,
                full_name: fullName, // Make sure column name matches 'full_name' in your DB
                password_hash: passwordHash,
                role,
                // We are intentionally NOT inserting roleDetails fields like 'major' or 'studentIdNumber' here
            })
            .returning(['user_id', 'email', 'role']);

        return newUser;

    } catch (error) {
        // Log and re-throw the error for the calling function (index.js) to handle
        console.error('Database insertion error:', error.message);
        throw error;
    }
}

/**
 * Logs in a user by verifying credentials against the database.
 * * @param {string} email - User's email.
 * @param {string} password - Plain-text password.
 * @param {string} role - Expected user role.
 * @returns {object|null} The user object (excluding the password hash) or null if verification fails.
 */
async function loginUser(email, password, role) {
    try {
        const user = await db('users')
            .where({ email, role })
            .first();

        if (!user) {
            return null; // User not found or role mismatch
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            // Return user details without the password hash
            const { password_hash, ...userDetails } = user;
            return userDetails;
        }

        return null; // Password mismatch

    } catch (error) {
        console.error('Login error:', error.message);
        throw error;
    }
}


module.exports = {
    signUpUser,
    loginUser,
};