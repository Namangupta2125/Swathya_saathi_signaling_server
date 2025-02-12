const Queue = require("./queue");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { Server } = require("socket.io");

const keyPath = path.join(__dirname, "Key 7_2_2025, 10_32_47 pm.pk");
const privateKey = fs.readFileSync(keyPath, "utf8");

const patientQueue = new Queue();
const doctorQueue = new Queue();

module.exports = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    const { role } = socket.handshake.query;

    if (role === "DOCTOR") {
      doctorQueue.enqueue(socket.id);
    } else {
      patientQueue.enqueue(socket.id);
    }

    console.log(`Client connected: ${socket.id} as ${role}`);

    matchDoctorAndPatient(io);

    socket.on("SEND_PRESCRIPTION", ({ roomId, prescription }) => {
      io.to(roomId).emit("RECEIVE_PRESCRIPTION", { prescription });
    });

    socket.on("SEND_NOTES", ({ roomId, notes }) => {
      io.to(roomId).emit("RECEIVE_NOTES", { notes });
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);

      if (doctorQueue.front() === socket.id) {
        doctorQueue.dequeue();
      } else if (patientQueue.front() === socket.id) {
        patientQueue.dequeue();
      }

      if (socket.roomId) {
        const roomId = socket.roomId;
        socket.leave(roomId);

        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (!roomSockets || roomSockets.size === 0) {
          console.log(`Room ${roomId} is now empty.`);
        } else {
          const remainingUserId = [...roomSockets][0];
          io.to(remainingUserId).emit("FORCE_DISCONNECT");
          io.sockets.sockets.get(remainingUserId)?.disconnect();
        }
      }
    });
  });

  function matchDoctorAndPatient(io) {
    if (!doctorQueue.isEmpty() && !patientQueue.isEmpty()) {
      const patientId = patientQueue.dequeue();
      const doctorId = doctorQueue.dequeue();

      if (!io.sockets.sockets.has(patientId) || !io.sockets.sockets.has(doctorId)) {
        return;
      }

      const roomId = `room-${doctorId}-${patientId}`;

      io.sockets.sockets.get(patientId).join(roomId);
      io.sockets.sockets.get(doctorId).join(roomId);

      io.sockets.sockets.get(patientId).roomId = roomId;
      io.sockets.sockets.get(doctorId).roomId = roomId;

      io.to(roomId).emit("ROOM_CREATED", { roomId, doctor: doctorId, patient: patientId });

      setTimeout(() => {
        const meetingLink = generateJitsiMeetingLink(roomId);
        io.to(roomId).emit("MEETING_LINK", { roomId, meetingLink });
      }, 1000);
    }
  }

  function generateJitsiJWT(roomId) {
    const payload = {
      aud: "jitsi",
      iss: "chat",
      sub: "8x8.vc",
      room: roomId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      context: {
        user: {
          name: "Doctor-Patient",
          email: "gutpanamandream21sd@gmail.com",
          id: roomId,
        },
        features: {
          livestreaming: false,
          recording: true,
          transcription: true,
        },
      },
    };

    return jwt.sign(payload, privateKey, { algorithm: "RS256" });
  }

  function generateJitsiMeetingLink(roomId) {
    const tenant = process.env.JAAS_TENANT;
    const jwtToken = generateJitsiJWT(roomId);
    return `https://8x8.vc/${tenant}/${roomId}#jwt=${jwtToken}`;
  }
};
