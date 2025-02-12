module.exports = (io) => {
  const patientQueue = new Queue();
  const doctorQueue = new Queue();
  
  io.on("connection", (socket) => {
    const { role } = socket.handshake.query;
    if (role === "DOCTOR") doctorQueue.enqueue(socket.id);
    else patientQueue.enqueue(socket.id);

    socket.on("SEND_MESSAGE", ({ type, message }) => {
      if (socket.roomId) {
        socket.to(socket.roomId).emit("NEW_MESSAGE", { type, message });
      }
    });

    socket.on("LEAVE_MEETING", () => {
      if (socket.roomId) {
        io.to(socket.roomId).emit("MEETING_ENDED");
      }
    });

    socket.on("disconnect", () => {
      if (socket.roomId) {
        io.to(socket.roomId).emit("MEETING_ENDED");
      }
    });

    function matchPatientsAndDoctors() {
      if (!doctorQueue.isEmpty() && !patientQueue.isEmpty()) {
        const doc = doctorQueue.dequeue();
        const pt = patientQueue.dequeue();
        const roomId = `room-${doc}-${pt}`;

        io.sockets.sockets.get(pt).join(roomId);
        io.sockets.sockets.get(doc).join(roomId);
        io.sockets.sockets.get(pt).roomId = roomId;
        io.sockets.sockets.get(doc).roomId = roomId;

        const meetingLink = generateJitsiMeetingLink(roomId);
        io.to(roomId).emit("MEETING_LINK", { meetingLink });
      }
    }

    matchPatientsAndDoctors();
  });
};
