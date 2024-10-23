import express from 'express';
import pg from 'pg';

const app = express();
const port = 3000;

// PostgreSQL connection configuration
const pool = new pg.Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'Mindease',
  password: 't@nish04',
  port: 5432,
});

// Setting up the EJS view engine
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true })); // For parsing form data

// Serve static files like CSS, JS, etc.
app.use(express.static('public'));

// Show login page as the default (opening) page at "/"
app.get('/', (req, res) => {
  res.render('login.ejs');
});

// Handle login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Admin login
    if (username === 'admin' && password === 'admin') {
      return res.redirect('/admin/users');
    }

    // Regular user login
    const queryText = 'SELECT * FROM users WHERE username = $1 AND password = $2';
    const result = await pool.query(queryText, [username, password]);

    if (result.rows.length === 0) {
      return res.render('login.ejs', { error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // Check if the user is verified
    if (!user.verified) {
      return res.render('login.ejs', { error: 'Your account is not verified. Please contact the admin.' });
    }

    // Successful login
    res.render('index.ejs', { username: user.username });

  } catch (error) {
    console.error(error);
    res.render('login.ejs', { error: 'Server error' });
  }
});

// Show registration page
app.get('/register', (req, res) => {
  res.render('register.ejs');
});

// Handle registration
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const queryText = 'INSERT INTO users (username, email, password, verified) VALUES ($1, $2, $3, $4)';
    await pool.query(queryText, [username, email, password, false]);

    // Redirect to login after successful registration
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.render('register.ejs', { error: 'Error: User already exists or invalid data' });
  }
});

// Show dashboard (after login)
app.get('/main', (req, res) => {
  res.render('index.ejs');
});

// Admin panel to list users and verify them
app.get('/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, verified FROM users');
    res.render('admin.ejs', { users: result.rows, error: null });
  } catch (error) {
    console.error(error);
    res.render('admin.ejs', { users: [], error: 'Failed to fetch users.' });
  }
});

// Admin verification of users
app.put('/admin/users/verify/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    const result = await pool.query('UPDATE users SET verified = true WHERE id = $1', [userId]);
    if (result.rowCount > 0) {
      res.status(200).json({ message: 'User verified successfully' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Start the server
app.listen(port, () => {
  console.log('Server is running on port 3000');
});
