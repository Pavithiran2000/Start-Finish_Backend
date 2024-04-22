const express = require('express');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');

const upload = multer();
const app = express();
app.use(express.json());
app.use(cors()); 
const dbConfig = {
    user: 'username',       //change with your Database username
    password: 'password',   //change with your Database Password
    host: 'localhost',
    port: 5432, 
    database: 'sample'      //change with your Database name
  };

const pool = new Pool(dbConfig);

app.use(cors({
    origin: 'http://localhost:3000', 
  }));

  app.post('/signup', async (req, res) => {
    const { firstName, lastName, email, phoneNumber, password } = req.body;

    try {
        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userExists.rows.length > 0) {
            return res.status(409).send({ message: 'User already exists!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (first_name, last_name, email, phone_number, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING user_id',
            [firstName, lastName, email, phoneNumber, hashedPassword]
        );

        res.status(201).send({ userId: result.rows[0].user_id }); 
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});


app.post('/signin', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            const isValid = await bcrypt.compare(password, user.password_hash);

            if (isValid) {
                const token = jwt.sign(
                    { userId: user.user_id, email: user.email },
                    '8FmNv6SdX8wLXq7nQ9vTh2F9J4dB3aVc', 
                    { expiresIn: '1h' } 
                );    
                res.status(200).send({ 
                    error: '', 
                    message: 'Login successful', 
                    userId: user.user_id,
                    email:user.email,
                    token 
                });
            } else {
                res.status(401).send({ error: 'Wrong password!' });
            }
        } else {
            res.status(404).send({ error: 'Email not found!' });
        }
    } catch (error) {
        console.error(error); 
        res.status(500).send('Server error!');
    }
});

app.get('/profile', async (req, res) => {
    const userId = req.query.userId;

    try {
        const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);

        if (result.rows.length > 0) {
            const userProfile = {
                firstName: result.rows[0].first_name,
                lastName: result.rows[0].last_name,
                email: result.rows[0].email,
                phoneNumber: result.rows[0].phone_number
            };
            res.status(200).send(userProfile);
        } else {
            res.status(404).send({ message: 'User not found!' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error!');
    }
});

app.post('/update-profile/:userId', async (req, res) => {
    const userId = req.params.userId;
    const { firstName, lastName, phoneNumber } = req.body;

    try {
        await pool.query(
            'UPDATE users SET first_name = $1, last_name = $2, phone_number = $3 WHERE user_id = $4',
            [firstName, lastName, phoneNumber, userId]
        );
        res.status(200).send('Profile updated successfully!');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// app.post('/upload-profile-image/:userId', upload.single('profileImage'), async (req, res) => {
//     const userId = req.params.userId;
//     const profileImage = req.file; 

//     try {
//         if (!profileImage) {
//             return res.status(400).send('No profile image uploaded');
//         }

//         await saveProfileImageToDatabase(profileImage, userId);

//         res.status(200).send('Profile image uploaded successfully!');
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Server error');
//     }
// });


app.post('/add-task', async (req, res) => {
    const { title, description, taskDate, userId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO tasks (title, description, task_date, user_id) VALUES ($1, $2, $3, $4) RETURNING task_id',
            [title, description, taskDate, userId]
        );

        res.status(201).send({ taskId: result.rows[0].task_id }); 
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

app.get('/today-tasks', async (req, res) => {
    try {
        const { userId, date } = req.query;
        const tasks = await pool.query('SELECT * FROM tasks WHERE user_id = $1 AND task_date = $2', [userId, date]);

        res.status(200).send(tasks.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

app.put('/tasks/:id', async (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;
    
    try {
      const result = await pool.query(
        'UPDATE tasks SET title = $1, description = $2 WHERE task_id = $3',
        [title, description, id]
      );
  
      res.status(200).send({ message: 'Task updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).send('Server error');
    }
  });

app.delete('/tasks/:id', async (req, res) => {
    try {
        const { id } = req.params; 
        const deleteResult = await pool.query('DELETE FROM tasks WHERE task_id = $1', [id]);
        
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ message: 'Task not found' }); 
        }

        res.status(200).json({ message: 'Task successfully deleted', deletedCount: deleteResult.rowCount });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});


app.get('/all-tasks', async (req, res) => {
    try {
    const { userId } = req.query;
    const tasks = await pool.query("SELECT * FROM tasks WHERE user_id = $1 ORDER BY TO_DATE(task_date, 'YYYY-MM-DD')", [userId]);
    
    res.status(200).send(tasks.rows);
    } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
    }
});
  

  
const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
