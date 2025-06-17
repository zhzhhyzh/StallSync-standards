const express = require('express');
const bodyParser = require('body-parser');
const passport = require('passport');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const rateLimit = require("express-rate-limit");
const db = require('./models');
const common = require('./common/common');

const app = express();

// Middleware
app.use(cors({ origin: ['http://localhost:3000'], credentials: true }));
app.use(bodyParser.json());
app.use(passport.initialize());
require('./config/passport')(passport);

// Logging
const accessLog = fs.createWriteStream(path.join(__dirname, 'logs/access.log'), { flags: 'a' });
morgan.token('date', () => moment().format('DD-MM-YYYY, h:mm:ss a'));
app.use(morgan('[:date] :method :url :status', { stream: accessLog }));

// Rate limiting
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Routes
app.use('/api/psusrprf', require('./routes/psusrprf'));
// (Add other routes similarly)

// Fallback for unknown APIs
app.use((req, res) => res.status(404).send('APINOTFOUND'));

// Error logging
process.on('uncaughtException', err => {
  common.logging("ERROR", moment().format() + " " + JSON.stringify(err));
  process.exit(1);
});

process.on('unhandledRejection', err => {
  common.logging("ERROR", moment().format() + " " + JSON.stringify(err));
  process.exit(1);
});

// Start server
async function start() {
  try {
    await db.sequelize.authenticate();
    await db.sequelize.sync();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('DB connection failed. Retrying...', err.message);
    setTimeout(start, 5000);
  }
}

start();
