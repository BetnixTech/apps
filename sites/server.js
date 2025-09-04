const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = 3000;

const SITES_DIR = path.join(__dirname, 'sites');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if(!fs.existsSync(SITES_DIR)) fs.mkdirSync(SITES_DIR);
if(!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Middleware
app.use(bodyParser.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

// Save site
app.post('/save', (req,res)=>{
    const { name, json } = req.body;
    if(!name) return res.status(400).json({error:"No site name"});
    fs.writeFileSync(path.join(SITES_DIR,name+'.json'), json);
    res.json({success:true,url:'/sites/'+name});
});

// Upload file
app.post('/upload', upload.single('file'), (req,res)=>{
    if(!req.file) return res.status(400).json({error:"No file uploaded"});
    res.json({success:true,url:'/uploads/'+req.file.filename});
});

// View site
app.get('/sites/:name', (req,res)=>{
    const siteFile = path.join(SITES_DIR, req.params.name+'.json');
    if(!fs.existsSync(siteFile)) return res.send('Site not found');
    const site = JSON.parse(fs.readFileSync(siteFile,'utf8'));

    let html = `<!DOCTYPE html><html><head><title>${site.name}</title>`;
    if(site.favicon) html += `<link rel="icon" href="${site.favicon}">`;
    html += `<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap" rel="stylesheet">`;
    html += `<style>body{font-family:'Roboto',sans-serif;background:#fff;margin:0;padding:0}.element{position:absolute;}</style></head><body>`;
    site.elements.forEach(el=>{
        if(el.type==='text') html += `<div class="element" style="left:${el.x}px;top:${el.y}px;color:${el.style.color};font-size:${el.style.fontSize};">${el.content}</div>`;
        else if(el.type==='image') html += `<img class="element" src="${el.src}" style="position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;">`;
    });
    html += `</body></html>`;
    res.send(html);
});

// List sites
app.get('/', (req,res)=>{
    const files = fs.readdirSync(SITES_DIR).filter(f=>f.endsWith('.json')).map(f=>f.replace('.json',''));
    let html = `<!DOCTYPE html><html><head><title>Betnix Sites</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap" rel="stylesheet">
    <style>body{font-family:'Roboto',sans-serif;padding:20px;background:#f5f5f5}a{text-decoration:none;color:#1a73e8;margin-right:10px}</style>
    </head><body><h1>Betnix Sites</h1><a href="editor.html">Create New Site</a><ul>`;
    files.forEach(f=>{
        html += `<li><a href="/sites/${f}">${f}</a> | <a href="editor.html?site=${f}">Edit</a></li>`;
    });
    html += `</ul></body></html>`;
    res.send(html);
});

app.listen(PORT,()=>console.log(`Server running at http://localhost:${PORT}`));
