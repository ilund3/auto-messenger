// Vercel serverless function entry point
const app = require('../server');

// Export the Express app as the handler for Vercel
// Vercel's @vercel/node builder automatically handles Express apps
module.exports = app;


