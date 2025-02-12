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
    console.log(`New connection: ${socket.id}, Role: ${role}`);

    if (role === "DOCTOR") {
      doctorQueue.enqueue(socket);
      console.log(`Doctor added to queue. Queue size: ${doctorQueue.size()}`);
    } else {
      patientQueue.enqueue(socket);
      console.log(`Patient added to queue. Queue size: ${patientQueue.size()}`);
    }

    function tryMatch() {
      console.log(`Checking match... Doctor Queue: ${doctorQueue.size()}, Patient Queue: ${patientQueue.size()}`);

      if (!doctorQueue.isEmpty() && !patientQueue.isEmpty()) {
        console.log("Match found! Connecting doctor and patient...");

        const patientSocket = patientQueue.dequeue();
        const doctorSocket = doctorQueue.dequeue();

        if (!io.sockets.sockets.has(patientSocket.id) || !io.sockets.sockets.has(doctorSocket.id)) {
          console.log("Error: One of the sockets is disconnected.");
          return;
        }

        const roomId = `room-${doctorSocket.id}-${patientSocket.id}`;
        patientSocket.join(roomId);
        doctorSocket.join(roomId);

        patientSocket.roomId = roomId;
        doctorSocket.roomId = roomId;

        console.log(`Room Created: ${roomId}`);

        io.to(roomId).emit("ROOM_CREATED", { roomId });

        setTimeout(() => {
          const meetingLink = generateJitsiMeetingLink(roomId);
          console.log(`Meeting Link Generated: ${meetingLink}`);
          io.to(roomId).emit("MEETING_LINK", { meetingLink });
        }, 1000);
      }
    }

    const matchInterval = setInterval(tryMatch, 1000);

    socket.on("SEND_PRESCRIPTION", ({ roomId, prescription }) => {
      console.log(`Prescription sent in ${roomId}`);
      io.to(roomId).emit("RECEIVE_PRESCRIPTION", { prescription });
    });

    socket.on("SEND_NOTES", ({ roomId, notes }) => {
      console.log(`Notes sent in ${roomId}`);
      io.to(roomId).emit("RECEIVE_NOTES", { notes });
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);

      if (socket.roomId) {
        console.log(`Forcing disconnect for room: ${socket.roomId}`);
        io.to(socket.roomId).emit("FORCE_DISCONNECT");
        io.socketsLeave(socket.roomId);
      }

      clearInterval(matchInterval);
    });
  });

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
