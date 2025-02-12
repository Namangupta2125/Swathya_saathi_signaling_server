const Queue = require("./queue");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const keyPath = path.join(__dirname, "Key 7_2_2025, 10_32_47 pm.pk");
const privateKey = fs.readFileSync(keyPath, "utf8");

const patientQueue = new Queue();
const doctorQueue = new Queue();
const activeConnections = new Map();

module.exports = (io) => {
  io.on("connection", (socket) => {
    const { role } = socket.handshake.query;
    activeConnections.set(socket.id, role);

    if (role === "DOCTOR") doctorQueue.enqueue(socket.id);
    else patientQueue.enqueue(socket.id);

    socket.on("disconnect", () => {
      activeConnections.delete(socket.id);
      doctorQueue.remove(socket.id);
      patientQueue.remove(socket.id);
    });

    function matchPatients() {
      while (!doctorQueue.isEmpty() && !patientQueue.isEmpty()) {
        const doc = doctorQueue.front();
        const pt = patientQueue.front();

        if (!activeConnections.has(pt)) {
          patientQueue.dequeue();
          continue;
        }

        if (!activeConnections.has(doc)) {
          doctorQueue.dequeue();
          continue;
        }

        patientQueue.dequeue();
        doctorQueue.dequeue();

        const roomId = `room-${doc}-${pt}`;
        io.to(doc).emit("ROOM_CREATED", { roomId });
        io.to(pt).emit("ROOM_CREATED", { roomId });

        const meetingLink = generateJitsiMeetingLink(roomId);
        io.to(roomId).emit("MEETING_LINK", { roomId, meetingLink });
      }
    }

    setInterval(matchPatients, 1000);
  });

  function generateJitsiMeetingLink(roomId) {
    const jwtToken = generateJitsiJWT(roomId);
    return `https://8x8.vc/${process.env.JAAS_TENANT}/${roomId}#jwt=${jwtToken}`;
  }

  function generateJitsiJWT(roomId) {
    const payload = {
      aud: "jitsi",
      iss: "chat",
      sub: "8x8.vc",
      room: roomId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      context: { user: { name: "Doctor-Patient" } },
    };
    return jwt.sign(payload, privateKey, { algorithm: "RS256" });
  }
};
