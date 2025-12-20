const knex = require('knex');

// IMPORTANT: Replace these connection details with your actual PostgreSQL configuration
const knexConfig = {
    client: 'pg',
    connection: {
        host: 'localhost',  
        user: env.PG_USER,    
        password: 'password', 
        database: 'doubtoutdb', // Ensure this is set to 'doubtoutdb'
        port: 5432,
    },
    pool: {
        min: 2,
        max: 10
    }
};

// 1. Initialize the Knex instance
const db = knex(knexConfig);

/**
 * Utility function to test the database connection.
 * Used by index.js before starting the server.
 */
async function connectDb() {
    console.log('Connecting to the database...');
    try {
        // Use Knex to run a simple query to verify the connection
        await db.raw('SELECT 1');
        console.log('✅ Database connection successful.');
    } catch (error) {
        console.error('Database connection failed:', error.message);
        throw error;
    }
}


// 2. EXPORT BOTH THE DB INSTANCE (for authService) AND the connectDb function (for index.js)
// We need to export `db` as the default export (via module.exports)
// and connectDb as a named export.

module.exports = db; // Export the Knex instance for query building

// Attach the connectDb function to the module export for index.js to use
module.exports.connectDb = connectDb;
