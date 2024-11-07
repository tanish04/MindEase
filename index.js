import express from 'express';
import pg from 'pg';
import session from 'express-session';

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
app.use(express.json()); // For parsing JSON data
app.use(express.static('public')); // Serve static files

// Set up session management
app.use(session({
  secret: 'your_secret_key', // Use a strong secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Show login page as the default (opening) page at "/"
app.get('/', (req, res) => {
  res.render('login.ejs');
});

// Handle login with password (no verification)
app.post('/login', async (req, res) => {
  const { username, password } = req.body; // Add password to login

  try {
    // Admin login
    if (username === 'admin') {
      return res.redirect('/admin/users');
    }

    // Regular user login
    const queryText = 'SELECT * FROM users WHERE username = $1 AND password = $2';
    const result = await pool.query(queryText, [username, password]);

    if (result.rows.length === 0) {
      return res.render('login.ejs', { error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    // Store user ID in session
    req.session.userId = user.id;

    // Successful login
    res.render('index.ejs', { username: user.username, userId: user.id });

  } catch (error) {
    console.error(error);
    res.render('login.ejs', { error: 'Server error' });
  }
});

// Show registration page
app.get('/register', (req, res) => {
  res.render('register.ejs');
});

// Handle registration with password
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body; // Include password in registration

  try {
    // Check if the email already exists
    const emailCheckQuery = 'SELECT * FROM users WHERE email = $1';
    const emailCheckResult = await pool.query(emailCheckQuery, [email]);

    if (emailCheckResult.rows.length > 0) {
      return res.render('register.ejs', { error: 'Email already in use. Please use a different email.' });
    }

    // If the email does not exist, insert the new user
    const queryText = 'INSERT INTO users (username, email, password) VALUES ($1, $2, $3)';
    await pool.query(queryText, [username, email, password]);

    // Redirect to login after successful registration
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.render('register.ejs', { error: 'Error: User already exists or invalid data' });
  }
});

// Show dashboard (after login)
app.get('/main', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/'); // Redirect if not logged in
  }
  res.render('index.ejs', { userId: req.session.userId });
});

app.post('/main',(req,res)=>{
  res.render("index.ejs");
});

// Admin panel to list users
app.get('/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email FROM users');
    res.render('admin.ejs', { users: result.rows, error: null });
  } catch (error) {
    console.error(error);
    res.render('admin.ejs', { users: [], error: 'Failed to fetch users.' });
  }
});

// Fetch doctors based on selected department
app.get('/doctors', async (req, res) => {
  const departmentId = req.query.department_id;

  try {
    const doctorsQuery = 'SELECT id, name FROM doctors WHERE department_id = $1';
    const result = await pool.query(doctorsQuery, [departmentId]);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

// Get available slots for a doctor
app.get('/available-slots', async (req, res) => {
  const doctorId = req.query.doctor_id;

  console.log(`Doctor ID: ${doctorId}`); // Check if doctorId is correctly passed

  try {
    const slotsQuery = `
      SELECT (s.time_slot::time) AS time_slot,
             COALESCE((SELECT COUNT(*) FROM appointments WHERE doctor_id = $1 AND time_slot = s.time_slot::time AND created_at::date = CURRENT_DATE), 0) AS booked
      FROM generate_series(
        '2023-01-01 09:00:00'::timestamp, 
        '2023-01-01 17:00:00'::timestamp, 
        '1 hour'
      ) AS s(time_slot)
      WHERE (EXTRACT(HOUR FROM s.time_slot) < 12 OR EXTRACT(HOUR FROM s.time_slot) >= 14) -- Skip lunch break
    `;
    const result = await pool.query(slotsQuery, [doctorId]);

    const availableSlots = result.rows.map(slot => ({
      time: slot.time_slot,
      booked: slot.booked > 0
    }));

    console.log(availableSlots); // Log available slots
    res.json(availableSlots);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch available time slots' });
  }
});

// Handle appointment submission
app.post('/submit-appointment', async (req, res) => {
  const { doctorId, timeSlot, message } = req.body;
  const userId = req.session.userId; // Get userId from session

  try {
    // Ensure required fields are provided
    if (!userId || !doctorId || !timeSlot) {
      return res.redirect('/main'); // Redirect silently if fields are missing
    }

    // Insert the appointment data into the database
    const insertQuery = `
      INSERT INTO appointments (user_id, doctor_id, time_slot, message, status, created_at)
      VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP)
    `;
    await pool.query(insertQuery, [userId, doctorId, timeSlot, message]);

    // Redirect to the user's appointments page after successful booking
    res.redirect(`/user-appointments/${userId}`);
  } catch (error) {
    console.error('Error booking appointment:', error);
    res.redirect(`/user-appointments/${userId}`); // Redirect silently on error
  }
});

// Render User Appointments page
app.get('/user-appointments/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const appointmentsQuery = `
      SELECT d.name AS doctor_name, a.time_slot, a.message, a.status 
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      WHERE a.user_id = $1
    `;
    const result = await pool.query(appointmentsQuery, [userId]);
    res.render('appointment.ejs', { appointments: result.rows });
  } catch (error) {
    console.error(error);
    res.render('appointment.ejs', { error: 'Error loading appointments' });
  }
});

// Handle appointment cancellation
app.delete('/cancel-appointment', async (req, res) => {
  const { appointmentId } = req.body;

  console.log("Received Appointment ID for deletion:", appointmentId); // Debugging log

  if (!appointmentId || isNaN(appointmentId)) {
    return res.status(400).json({ success: false, message: "Valid Appointment ID is required." });
  }

  try {
    const result = await pool.query('DELETE FROM appointments WHERE id = $1', [appointmentId]);
    if (result.rowCount > 0) {
      return res.json({ success: true, message: "Appointment canceled successfully." });
    } else {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }
  } catch (error) {
    console.error('Error canceling appointment:', error);
    return res.status(500).json({ success: false, message: "Failed to cancel appointment." });
  }
});

// Start the server
app.listen(port, () => {
  console.log('Server is running on port 3000');
});
