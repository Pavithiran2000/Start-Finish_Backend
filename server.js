const express = require("express");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const cors = require("cors");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const { google } = require("googleapis");
const { Server } = require("socket.io");
const http = require("http");
const Queue = require("bull");
const { createBullBoard } = require("@bull-board/api");
const { BullAdapter } = require("@bull-board/api/bullAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const { get } = require("https");


dotenv.config();
const upload = multer();
const PORT = 3001;
const app = express();
app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:3000",
  })
);
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.info(`For the UI, open http://localhost:${PORT}/admin/queues`);
  console.info("Make sure Redis is running on port 6379 by default");
});

const redisOptions = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
};
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_DATABASE,
};

const pool = new Pool(dbConfig);
const userQueue = new Queue("user", redisOptions);
const teacherQueue = new Queue("teachers", redisOptions);

userQueue.process((payload, done) => {
  done();
  io.emit("userQueueUpdated");
  userQueue
    .getJobs()
    .then((jobs) => {
      console.log("after add user:");
      jobs.forEach((job) => {
        console.log(job.data);
      });
      console.log("\n");
    })
    .catch((error) => {
      console.error("Error fetching User queue jobs:", error);
    });
});

teacherQueue.process((payload, done) => {
  done();
  io.emit("teacherQueueUpdated");
  teacherQueue
    .getJobs()
    .then((jobs) => {
      console.log("after add teacher:");
      jobs.forEach((job) => {
        console.log(job.data);
      });
      console.log("\n");
    })
    .catch((error) => {
      console.error("Error fetching teacher queue jobs:", error);
    });
});

userQueue
  .getJobs()
  .then((jobs) => {
    console.log("existing users:");
    jobs.forEach((job) => {
      console.log(job.data);
    });
    console.log("\n");
  })
  .catch((error) => {
    console.error("Error fetching User queue jobs:", error);
  });

teacherQueue
  .getJobs()
  .then((jobs) => {
    console.log("existing teachers:");
    jobs.forEach((job) => {
      console.log(job.data);
    });
    console.log("\n");
  })
  .catch((error) => {
    console.error("Error fetching teacher queue jobs:", error);
  });

const queuesList = ["user", "teachers"];
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

const queues = queuesList
  .map((qs) => new Queue(qs, redisOptions))
  .map((q) => new BullAdapter(q));
const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues,
  serverAdapter: serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

// app.get('/api/getUserQueue', async (req, res) => {
//   try {
//       // Fetch userQueue from Bull and send it to the frontend
//       const jobs = await userQueue.getJobs(['waiting', 'delayed', 'active', 'completed']);
//       const userQueueData = jobs.map(job => job.data);

//       res.json(userQueueData);
//   } catch (error) {
//       console.error('Error fetching userQueue:', error);
//       res.status(500).json({ error: 'Internal server error' });
//   }
// });
app.post("/api/userStatus/:userId", async (req, res) => {
  try {
    let position = -1,
      status = false;
    const userId = req.params.userId;
    // Fetch userQueue from Bull and send it to the frontend
    const jobs = await userQueue.getJobs([
      "waiting",
      "delayed",
      "active",
      "completed",
    ]);
    const userQueueData = jobs.map((job) => job.data);
    const userQueues = userQueueData.map((obj) => obj.user).reverse();
    userQueues.forEach((user, index) => {
      if (parseInt(userId) === parseInt(user)) {
        position = index + 1;
        status = true;
      }
    });
    if (position === -1) {
      status = false;
    }
    res.json({ userQueues, position, status });
  } catch (error) {
    console.error("Error fetching userQueue:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/getUserQueue", async (req, res) => {
  try {
    // Fetch teacherQueue from Bull and send it to the frontend
    const jobs = await userQueue.getJobs([
      "waiting",
      "delayed",
      "active",
      "completed",
    ]);
    const userQueueData = jobs.map((job) => job.data);
    res.json(userQueueData);
  } catch (error) {
    console.error("Error fetching userQueue:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/getTeacherQueue", async (req, res) => {
  try {
    // Fetch teacherQueue from Bull and send it to the frontend
    const jobs = await teacherQueue.getJobs([
      "waiting",
      "delayed",
      "active",
      "completed",
    ]);
    const teacherQueueData = jobs.map((job) => job.data);
    res.json(teacherQueueData);
  } catch (error) {
    console.error("Error fetching teacherQueue:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.post("/api/requestMeeting/:userId", async (req, res) => {
  const userId = req.params.userId;
  userQueue.add({ user: userId });
  io.emit("userQueueUpdated");
});

app.post("/api/cancelRequest/:userId", async (req, res) => {
  const userId = req.params.userId;

  const jobs = await userQueue.getJobs([
    "waiting",
    "delayed",
    "active",
    "completed",
  ]);
  const userJob = jobs.find((job) => job.data.user === userId);
  if (jobs.find((job) => job.data.user === userId)) {
    await userJob.remove();
  }
  io.emit("userQueueUpdated");
  const remainingJobs = await userQueue.getJobs([
    "waiting",
    "delayed",
    "active",
    "completed",
  ]);
  console.log("after delete user:");
  remainingJobs.forEach((job) => {
    console.log(job.data);
  });
});

//join a meeting
async function getMiss() {
  const jobs = await teacherQueue.getJobs([
    "waiting",
    "delayed",
    "active",
    "completed",
  ]);
  const teacherQueueData = jobs.map((job) => job.data);
  const teachersQueues = teacherQueueData.map((obj) => obj.teacher).reverse();
  console.log(teachersQueues);
}
getMiss();

app.post("/api/joinMeeting/:userId/:position", async (req, res) => {
  try {
    const userId = req.params.userId;
    const position = parseInt(req.params.position);
    const respons  = await pool.query(
      "SELECT * FROM meeting WHERE user_id = $1 AND meeting_status = TRUE",
      [userId]
    );
    console.log('respons');
    console.log(respons.rowCount);
    if(respons.rowCount > 0){
      const teacherId =respons.rows[0].teacher_id;
      const meetingId = respons.rows[0].meeting_id;
      const meetingLink = respons.rows[0].meeting_link;
      const meetingStatus = respons.rows[0].meeting_status;
      res.json({ teacherId, meetingId, meetingLink, meetingStatus });
    }
    else{
      let activeTeacher='';
      const jobs = await teacherQueue.getJobs([
        "waiting",
        "delayed",
        "active",
        "completed",
      ]);
      const teacherQueueData = jobs.map((job) => job.data);
      const teachersQueues = teacherQueueData.map((obj) => obj.teacher).reverse();
      teachersQueues.forEach((teacher, index) => {
        if (index === position - 1) {
          activeTeacher = teacher;
        }
      });
      const meetingLink = `http://localhost:3000/meeting`;
      const meetingStatus = true;
      const teacherId = activeTeacher;
      const respo = await pool.query(
        "INSERT INTO meeting (teacher_id, user_id, meeting_link, meeting_status) VALUES ($1, $2, $3, $4) RETURNING meeting_id",
        [teacherId, userId, meetingLink, meetingStatus]
      );
      console.log(respo.rows[0]);
      const meetingId = respo.rows[0].meeting_id;
      // const meetingId = 3;
      io.emit("meetingStatusUpdated", { teacherId, meetingStatus });
      io.emit("meetingUpdated", { teacherId, meetingId, userId });
      io.emit("teacherQueueUpdated");
      const ujobs = await userQueue.getJobs([
        "waiting",
        "delayed",
        "active",
        "completed",
      ]);
      const userJob = ujobs.find((job) => job.data.user === userId);
      if (userJob) {
        await userJob.remove();
      }
      io.emit("userQueueUpdated");
      const tjobs = await teacherQueue.getJobs([
        "waiting",
        "delayed",
        "active",
        "completed",
      ]);
      const teacherJob = tjobs.find((job) => job.data.teacher === teacherId);
      if (teacherJob) {
        await teacherJob.remove();
      }
      io.emit("teacherQueueUpdated"); 
      res.json({ teacherId, meetingId, meetingLink, meetingStatus });
  }
  } catch (error) {
    console.error("Error joining meeting:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/joinMeetingTeacher/:teacherId", async (req, res) => {
  try {
    const teacherId = req.params.teacherId;
    updateTeacherMeetingStatus(teacherId, true);
    io.emit("teacherQueueUpdated");
    res.status(200).json({ message: "Teacher connect successfully" });
    // res.json({ userId, teacherId, meetingId, meetingLink, meetingStatus});
  } catch (error) {
    console.error("Error joining meeting:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// // Function to get meeting by ID from the database
// async function getMeetingById(meetingId) {
//   const { rows } = await pool.query('SELECT * FROM meeting WHERE meeting_id = $1', [meetingId]);
//   return rows[0];
// }

async function getMeetingByTeacherId(teacherId) {
  const { rows } = await pool.query(
    "SELECT * FROM meeting WHERE teacher_id = $1 AND meeting_status = TRUE",
    [teacherId]
  );
  return rows[0];
}
app.get("/api/getMeetings/:teacherId", async (req, res) => {
  try {
    const teacherId = req.params.teacherId;
    const meeting = await getMeetingByTeacherId(teacherId);
    // const userId =meeting.user_id;
    // const meetingStatus=meeting.meeting_status;
    // const meetingLink= meeting.meeting_link;
    // const meetingId = meeting.meeting_id;
    // updateTeacherMeetingStatus(teacherId, true);
    // io.emit("teacherQueueUpdated");
    // res.json({ userId, meetingId, meetingLink, meetingStatus});
    res.json({ meeting });
  } catch (error) {
    console.error("Error joining meeting: jkkkkk", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to end the meeting by user
app.put("/api/endMeeting/:meetingId/:teacherId", async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const teacherId = req.params.teacherId;
    // Update the meeting status to false in the database
    const meetingStatus = false;
    const activeTeacher = await getTeacher(teacherId);
    console.log(activeTeacher[0]);
    console.log(activeTeacher[0].is_on_meeting);
    if (!activeTeacher[0].is_on_meeting) {
      await updateMeetingStatus(meetingId, meetingStatus);
      io.emit("meetingStatusUpdated", { teacherId, meetingStatus });
      teacherQueue.add({ teacher: teacherId });
      io.emit("teacherQueueUpdated");
      // const ujobs = await userQueue.getJobs([
      //   "waiting",
      //   "delayed",
      //   "active",
      //   "completed",
      // ]);
      // const userJob = ujobs.find((job) => job.data.user === userId);
      // if (userJob) {
      //   await userJob.remove();
      // }
      // io.emit("userQueueUpdated");
    }
    res.status(204).json({ message: "end meeting by user success" });
  } catch (error) {
    console.error("Error ending meeting:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// end meeting by teacher
app.put(
  "/api/endMeetingTeacher/:teacherId/:meetingId",
  async (req, res) => {
    try {
      const teacherId = req.params.teacherId;
      const meetingId = req.params.meetingId;
      const meetingStatus = false;
      // Update the meeting status to false in the database
      await updateTeacherMeetingStatus(teacherId, meetingStatus);
      await updateMeetingStatus(meetingId, meetingStatus);
      io.emit("meetingStatusUpdated", { teacherId, meetingStatus });
      teacherQueue.add({ teacher: teacherId });
      io.emit("teacherQueueUpdated");
      res.status(204).json({ message: "end meeting by teacher success" });
    } catch (error) {
      console.error("Error ending meeting:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
// disconnect meeting by teacher
app.put(
  "/api/disconnectMeetingTeacher/:teacherId/:meetingId/:userId",
  async (req, res) => {
    try {
      const teacherId = req.params.teacherId;
      const meetingId = req.params.meetingId;
      const userId = req.params.userId;
      const meetingStatus = false;
      // Update the meeting status to false in the database
        await updateMeetingStatus(meetingId, meetingStatus);
        io.emit("meetingStatusUpdated", { teacherId, meetingStatus });

      //   const jobs = await userQueue.getJobs(["completed"]);

      //   await Promise.all(jobs.map(async (job) => {
      //     // Assuming moveToWaiting is not the correct method
      //     // Use the appropriate method to change the job status to waiting
      //     await job.moveToWaiting(); // Adjust this line as per library documentation
      // }));

      // // Add the new user to the first place in the queue
      // await userQueue.add({ user: userId });

      // // Mark existing users' jobs as completed
      // await Promise.all(jobs.map(async (job) => {
      //     // Adjust this line as per the library documentation
      //     await job.moveToCompleted(); // Assuming moveToCompleted is the correct method
      // }));
      //   // Emit events to update user and teacher queues
      userQueue.add({ user: userId });
      await updateTeacherActive(false, teacherId);
      io.emit("userQueueUpdated");
      res.status(204).json({ message: "disconnect meeting by teacher success" });
    } catch (error) {
      console.error("Error disconnect meeting:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.get("/api/meetingTeacher/:meetingId", async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await pool.query(
      "SELECT teacher_id FROM meeting WHERE meeting_id = $1",
      [meetingId]
    );
    console.log(result);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Meeting not found" });
    }
    // const teacherId = result.rows[0].teacher_id;
    // await updateTeacherMeetingStatus(teacherId, true);

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating teacher meeting status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function updateTeacherMeetingStatus(teacherId, isMeeting) {
  // Execute SQL update statement to set is_meeting for the specified teacherId
  await pool.query(
    "UPDATE teachers SET is_on_meeting = $1 WHERE teacher_id = $2",
    [isMeeting, teacherId]
  );
}

async function updateMeetingStatus(meetingId, meetingStatus) {
  // Execute SQL update statement to set is_meeting for the specified teacherId
  await pool.query(
    "UPDATE meeting SET meeting_status = $2 WHERE meeting_id = $1 AND meeting_status = true",
    [meetingId, meetingStatus]
  );
}

app.get("/api/getMeetingStatus/:meetingId", async (req, res) => {
  try {
    const { meetingId } = req.params;
    // Fetch meeting details from your database or any other source
    const meetingStatus = await getMeetingStatus(meetingId); // Implement this function to fetch meeting details
    res.json({ meetingStatus });
  } catch (error) {
    console.error("Error fetching meeting details:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function getMeetingStatus(meetingId) {
  try {
    const res = await pool.query(
      "SELECT meeting_status FROM meeting where meeting_id = $1",
      [meetingId]
    );
    console.log(res.rows[0].meeting_status);
    return res.rows[0].meeting_status;
  } catch (error) {
    throw new Error(`Error fetching meeting details: ${error.message}`);
  }
}
// Endpoint to get the active teacher
app.get("/api/getActiveTeacher", async (req, res) => {
  try {
    const activeTeacher = await getTeacher(2);
    res.json(activeTeacher);
  } catch (error) {
    console.error("Error getting active teacher:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/getTeachers", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM teachers ORDER BY teacher_id ASC;"
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching teachers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/updateTeacher/:teacherId", async (req, res) => {
  const teacherId = req.params.teacherId;
  const { isActive } = req.body;
  if (isActive) {
    teacherQueue.add({ teacher: teacherId });
  } else {
    // Remove the job associated with the teacher from the Bull queue
    const jobs = await teacherQueue.getJobs([
      "waiting",
      "delayed",
      "active",
      "completed",
    ]);
    const teacherJob = jobs.find((job) => job.data.teacher === teacherId);
    if (jobs.find((job) => job.data.teacher === teacherId)) {
      await teacherJob.remove();
    }
    io.emit("teacherQueueUpdated");
    const remainingJobs = await teacherQueue.getJobs([
      "waiting",
      "delayed",
      "active",
      "completed",
    ]);
    console.log("after delete teacher:");
    remainingJobs.forEach((job) => {
      console.log(job.data);
    });
  }
  try {
    await updateTeacherActive(isActive,teacherId);
    res.status(200).json({ message: "Teacher status updated successfully" });
  } catch (error) {
    console.error("Error updating teacher status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Function to get active teacher from the database
async function getTeacher(teacherId) {
  const { rows } = await pool.query(
    "SELECT * FROM teachers WHERE teacher_id = $1",
    [teacherId]
  );
  return rows;
}
async function updateTeacherActive(isActive, teacherId) {
await pool.query(
  "UPDATE teachers SET is_active = $1 WHERE teacher_id = $2",
  [isActive, teacherId]
);
}

app.post("/signup", async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password } = req.body;

  try {
    const userExists = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(409).send({ message: "User already exists!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (first_name, last_name, email, phone_number, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING user_id",
      [firstName, lastName, email, phoneNumber, hashedPassword]
    );

    res.status(201).send({ userId: result.rows[0].user_id });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

app.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length > 0) {
      const user = result.rows[0];

      const isValid = await bcrypt.compare(password, user.password_hash);

      if (isValid) {
        const token = jwt.sign(
          { userId: user.user_id, email: user.email },
          "8FmNv6SdX8wLXq7nQ9vTh2F9J4dB3aVc",
          { expiresIn: "1h" }
        );
        res.status(200).send({
          error: "",
          message: "Login successful",
          userId: user.user_id,
          email: user.email,
          token,
        });
      } else {
        res.status(401).send({ error: "Wrong password!" });
      }
    } else {
      res.status(404).send({ error: "Email not found!" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error!");
  }
});

app.get("/profile", async (req, res) => {
  const userId = req.query.userId;

  try {
    const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      userId,
    ]);

    if (result.rows.length > 0) {
      const userProfile = {
        firstName: result.rows[0].first_name,
        lastName: result.rows[0].last_name,
        email: result.rows[0].email,
        phoneNumber: result.rows[0].phone_number,
      };
      res.status(200).send(userProfile);
    } else {
      res.status(404).send({ message: "User not found!" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error!");
  }
});

app.post("/update-profile/:userId", async (req, res) => {
  const userId = req.params.userId;
  const { firstName, lastName, phoneNumber } = req.body;

  try {
    await pool.query(
      "UPDATE users SET first_name = $1, last_name = $2, phone_number = $3 WHERE user_id = $4",
      [firstName, lastName, phoneNumber, userId]
    );
    res.status(200).send("Profile updated successfully!");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
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

app.post("/add-task", async (req, res) => {
  const { title, description, taskDate, userId } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO tasks (title, description, task_date, user_id) VALUES ($1, $2, $3, $4) RETURNING task_id",
      [title, description, taskDate, userId]
    );

    res.status(201).send({ taskId: result.rows[0].task_id });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// View today's tasks route
// app.get('/today-tasks', async (req, res) => {
//     try {
//         const { userId } = req.query;
//         date = new Date().toISOString().split('T')[0];
//         const tasks = await pool.query('SELECT * FROM tasks WHERE user_id = $1 AND task_date = $2', [userId, date]);

//         res.status(200).send(tasks.rows);
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Server error');
//     }
// });
app.get("/today-tasks", async (req, res) => {
  try {
    const { userId, date } = req.query;
    const tasks = await pool.query(
      "SELECT * FROM tasks WHERE user_id = $1 AND task_date = $2",
      [userId, date]
    );

    res.status(200).send(tasks.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

app.put("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;

  try {
    const result = await pool.query(
      "UPDATE tasks SET title = $1, description = $2 WHERE task_id = $3",
      [title, description, id]
    );

    res.status(200).send({ message: "Task updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

app.delete("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleteResult = await pool.query(
      "DELETE FROM tasks WHERE task_id = $1",
      [id]
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    res
      .status(200)
      .json({
        message: "Task successfully deleted",
        deletedCount: deleteResult.rowCount,
      });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

app.get("/all-tasks", async (req, res) => {
  try {
    const { userId } = req.query;
    const tasks = await pool.query(
      "SELECT * FROM tasks WHERE user_id = $1 ORDER BY TO_DATE(task_date, 'YYYY-MM-DD')",
      [userId]
    );

    res.status(200).send(tasks.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});
