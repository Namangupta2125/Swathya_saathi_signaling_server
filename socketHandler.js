const Queue = require("./queue");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

class ConsultationManager {
  constructor() {
    this.patientQueue = new Queue();
    this.doctorQueue = new Queue();
    this.activeRooms = new Map();
    this.privateKey = fs.readFileSync(
      path.join(__dirname, "Key 7_2_2025, 10_32_47 pm.pk"),
      "utf8"
    );
  }

  handleConnection(socket, io) {
    const { role, patientId } = socket.handshake.query;

    console.log(`New connection: ${socket.id}, Role: ${role}`);

    if (role === "DOCTOR") {
      this.doctorQueue.enqueue({ socketId: socket.id, timestamp: Date.now() });
      this.attemptMatching(io);
    } else if (role === "PATIENT") {
      this.patientQueue.enqueue({
        socketId: socket.id,
        patientId: patientId || "UNKNOWN",
        timestamp: Date.now(),
      });
      this.attemptMatching(io);
    }

    this.setupSocketHandlers(socket, io);
  }

  setupSocketHandlers(socket, io) {
    socket.on("disconnect", () => this.handleDisconnect(socket, io));
    socket.on("MESSAGE", ({ roomId, message }) =>
      this.handleMessage(socket, roomId, message, io)
    );
    socket.on("END_CALL", () => this.handleEndCall(socket, io));
  }

  handleDisconnect(socket, io) {
    console.log(`Disconnection: ${socket.id}`);

    this.patientQueue.remove((item) => item.socketId === socket.id);
    this.doctorQueue.remove((item) => item.socketId === socket.id);

    if (socket.roomId) {
      this.cleanupRoom(socket.roomId, io);
    }

    this.attemptMatching(io);
  }

  handleMessage(socket, roomId, message, io) {
    if (this.activeRooms.has(roomId)) {
      io.to(roomId).emit("NEW_MESSAGE", { sender: socket.id, message });
    }
  }

  handleEndCall(socket, io) {
    if (socket.roomId) {
      this.cleanupRoom(socket.roomId, io);
    }
  }

  async attemptMatching(io) {
    while (!this.patientQueue.isEmpty() && !this.doctorQueue.isEmpty()) {
      const patient = this.patientQueue.peek();
      const doctor = this.doctorQueue.peek();

      if (!this.isSocketConnected(io, patient.socketId)) {
        this.patientQueue.dequeue();
        continue;
      }

      if (!this.isSocketConnected(io, doctor.socketId)) {
        this.doctorQueue.dequeue();
        continue;
      }

      await this.createConsultation(patient, doctor, io);

      this.patientQueue.dequeue();
      this.doctorQueue.dequeue();
    }
  }

  async createConsultation(patient, doctor, io) {
    const roomId = `room-${doctor.socketId}-${patient.socketId}`;
    const patientSocket = io.sockets.sockets.get(patient.socketId);
    const doctorSocket = io.sockets.sockets.get(doctor.socketId);

    patientSocket.join(roomId);
    doctorSocket.join(roomId);

    patientSocket.roomId = roomId;
    doctorSocket.roomId = roomId;
    this.activeRooms.set(roomId, {
      patientId: patient.patientId,
      doctorSocketId: doctor.socketId,
      patientSocketId: patient.socketId,
      startTime: Date.now(),
    });

    io.to(roomId).emit("ROOM_CREATED", {
      roomId,
      doctor: doctor.socketId,
      patient: patient.socketId,
    });

    // Generate and send meeting link after a short delay
    setTimeout(() => {
      const meetingLink = this.generateJitsiMeetingLink(roomId);
      io.to(roomId).emit("MEETING_LINK", { roomId, meetingLink });
      console.log(`Meeting link sent: ${meetingLink}`);
    }, 1000);
  }

  cleanupRoom(roomId, io) {
    const room = this.activeRooms.get(roomId);
    if (room) {
      io.to(roomId).emit("FORCE_DISCONNECT");

      const sockets = io.sockets.adapter.rooms.get(roomId);
      if (sockets) {
        sockets.forEach((socketId) => {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.leave(roomId);
            delete socket.roomId;
          }
        });
      }

      this.activeRooms.delete(roomId);
    }
  }

  generateJitsiMeetingLink(roomId) {
    const tenant = process.env.JAAS_TENANT;
    const jwtToken = this.generateJitsiJWT(roomId);
    return `https://8x8.vc/${tenant}/${roomId}#jwt=${jwtToken}`;
  }

  generateJitsiJWT(roomId) {
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
          email: "consultation@example.com",
          id: roomId,
        },
        features: {
          livestreaming: false,
          recording: true,
          transcription: true,
        },
      },
    };

    return jwt.sign(payload, this.privateKey, { algorithm: "RS256" });
  }

  isSocketConnected(io, socketId) {
    return io.sockets.sockets.has(socketId);
  }
}

module.exports = (io) => {
  const consultationManager = new ConsultationManager();

  io.on("connection", (socket) => {
    consultationManager.handleConnection(socket, io);
  });

  // Periodic cleanup of stale rooms
  setInterval(() => {
    for (const [roomId, room] of consultationManager.activeRooms) {
      if (Date.now() - room.startTime > 4 * 60 * 60 * 1000) {
        consultationManager.cleanupRoom(roomId, io);
      }
    }
  }, 15 * 60 * 1000); 
};
