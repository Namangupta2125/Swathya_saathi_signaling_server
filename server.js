const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const socketHandler = require("./socketHandler.js"); 
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
// handling socket
socketHandler(io);

//statically passing the file
app.use(express.static(path.join(__dirname)))

//routes
app.get('/patient',(req,res)=>{
  return res.sendFile(path.join(__dirname,'patient.html'))
})

app.get("/doctor", (req, res) => {
  return res.sendFile(path.join(__dirname, "doctor.html"));
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
