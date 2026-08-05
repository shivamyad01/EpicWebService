/**
 * Database Configuration
 * Placeholder for database setup and models
 * Currently using SQLite for session storage via Shopify
 * 
 * In production, you can add:
 * - MongoDB with Mongoose
 * - PostgreSQL with Sequelize/Prisma
 * - MySQL with Sequelize/Prisma
 */

// The session database path is owned by shopify.js and must stay on the mounted
// volume. It is deliberately not duplicated here: this module used to export a
// second copy pointing at the working directory, which is the path that lost every
// merchant's session on each redeploy.

/**
 * Initialize database connection
 * Add your database initialization logic here
 */
export const initDatabase = async () => {
  // Example with Sequelize:
  // const sequelize = new Sequelize({
  //   dialect: 'sqlite',
  //   storage: DB_PATH
  // });
  // await sequelize.authenticate();
  // console.log('Database connected');
  
  console.log("Database initialized (using SQLite for sessions)");
};

/**
 * Close database connection
 */
export const closeDatabase = async () => {
  // Add cleanup logic here
  console.log("Database connection closed");
};

export default {
  initDatabase,
  closeDatabase
};
