const Queue = require("./queue");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const keyPath = path.join(__dirname, "Key 7_2_2025, 10_32_47 pm.pk");
const privateKey = fs.readFileSync(keyPath, "utf8");

const patientQueue = new Queue();
const doctorQueue = new Queue();

module.exports = (io) => {
  io.on("connection", (socket) => {
    const { role } = socket.handshake.query;

    if (role === "DOCTOR") doctorQueue.enqueue(socket.id);
    else patientQueue.enqueue(socket.id);

    console.log(`Client connected with role: ${role} and id ${socket.id}`);

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
          console.log(`Room ${roomId} is empty now.`);
        } else {
          const remainingUserId = [...roomSockets][0];
          io.to(remainingUserId).emit("FORCE_DISCONNECT");
          io.sockets.sockets.get(remainingUserId)?.disconnect();
        }
      }
    });

    socket.on("MESSAGE", ({ roomId, message }) => {
      console.log(`Message from ${socket.id} in room ${roomId}: ${message}`);
      socket.to(roomId).emit("NEW_MESSAGE", { sender: socket.id, message });
    });

    socket.on("PING", () => {
      console.log("PING FROM", socket.id);
      socket.emit("PONG");
    });
  });

  function isSocketConnected(socketId) {
    return io.sockets.sockets.has(socketId);
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
          avatar: "",
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

  async function job() {
    while (!doctorQueue.isEmpty() && !patientQueue.isEmpty()) {
      const patient = patientQueue.dequeue();
      const doctor = doctorQueue.dequeue();

      if (!isSocketConnected(patient)) {
        console.log(`Patient ${patient} disconnected before match.`);
        continue;
      }

      if (!isSocketConnected(doctor)) {
        console.log(`Doctor ${doctor} disconnected before match.`);
        continue;
      }

      const roomId = `room-${doctor}-${patient}`;

      io.sockets.sockets.get(patient).join(roomId);
      io.sockets.sockets.get(doctor).join(roomId);

      io.sockets.sockets.get(patient).roomId = roomId;
      io.sockets.sockets.get(doctor).roomId = roomId;

      io.to(roomId).emit("ROOM_CREATED", { roomId, doctor, patient });

      setTimeout(() => {
        const meetingLink = generateJitsiMeetingLink(roomId);
        io.to(roomId).emit("MEETING_LINK", { roomId, meetingLink });
        console.log(`Meeting link sent: ${meetingLink}`);
      }, 1000);
    }
  }

  setInterval(async () => {
    await job();
  }, 1000);
};
