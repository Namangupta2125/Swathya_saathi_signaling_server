const Queue = require("./queue");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const keyPath = path.join(__dirname, "Key 7_2_2025, 10_32_47 pm.pk");
const privateKey = fs.readFileSync(keyPath, "utf8");
 
const patient = new Queue();
const doctor = new Queue();

module.exports = (io) => {
  io.on("connection", (socket) => {
    // Checking role and entering socket ID into the queue
    const { role } = socket.handshake.query;
    if (role === "DOCTOR") doctor.enqueue(socket.id);
    else patient.enqueue(socket.id);

    console.log(`Client connected with role: ${role} and id ${socket.id}`);

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);

      // Remove disconnected user from queue 
      if (doctor.front() === socket.id) {
        doctor.dequeue();
      } else if (patient.front() === socket.id) {
        patient.dequeue();
      }
    });

    // Handle ping
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
    if (!doctor.isEmpty() && !patient.isEmpty()) {
      const pt = patient.front();
      const doc = doctor.front();

      // Check if both are still connected
      if (!isSocketConnected(pt)) {
        console.log(`Patient ${pt} disconnected before match.`);
        patient.dequeue();
        return;
      }

      if (!isSocketConnected(doc)) {
        console.log(`Doctor ${doc} disconnected before match.`);
        doctor.dequeue();
        return;
      }

      // Remove matched users from the queue
      patient.dequeue();
      doctor.dequeue();

      // Generate a unique room ID
      const roomId = `room-${doc}-${pt}`;

      // Add both users to the room **before** generating the Jitsi link
      io.sockets.sockets.get(pt).join(roomId);
      io.sockets.sockets.get(doc).join(roomId);

      console.log(`Room ${roomId} created for doctor ${doc} and patient ${pt}`);

      // Notify users they are matched and joined in a room
      io.to(roomId).emit("ROOM_CREATED", {
        roomId,
        doctor: doc, 
        patient: pt,
      });

      // Wait 1 second before sending the meeting link
      setTimeout(() => {
        const meetingLink = generateJitsiMeetingLink(roomId);
        io.to(roomId).emit("MEETING_LINK", {
          roomId,
          meetingLink,
        });

        console.log(`Meeting link sent: ${meetingLink}`);
      }, 1000);
    }
  }

  setInterval(async () => {
    await job();
  }, 1000);
};
