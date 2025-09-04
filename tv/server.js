const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// Serve HTML dashboard
app.use(express.static(__dirname));

// Serve movies folder
app.use("/movies", express.static(path.join(__dirname, "movies")));

app.get("/stream/:movie", (req,res)=>{
  const moviePath = path.join(__dirname, "movies", req.params.movie);
  fs.stat(moviePath,(err,stat)=>{
    if(err) return res.status(404).send("Movie not found");
    const fileSize = stat.size;
    const range = req.headers.range;
    if(range){
      const parts = range.replace(/bytes=/,"").split("-");
      const start = parseInt(parts[0],10);
      const end = parts[1]?parseInt(parts[1],10):fileSize-1;
      const chunksize = (end-start)+1;
      const file = fs.createReadStream(moviePath,{start,end});
      const head = {
        "Content-Range":`bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges":"bytes",
        "Content-Length":chunksize,
        "Content-Type":"video/mp4"
      };
      res.writeHead(206, head);
      file.pipe(res);
    }else{
      const head = {
        "Content-Length":fileSize,
        "Content-Type":"video/mp4"
      };
      res.writeHead(200, head);
      fs.createReadStream(moviePath).pipe(res);
    }
  });
});

app.listen(PORT,()=>console.log(`Server running at http://localhost:${PORT}`));
