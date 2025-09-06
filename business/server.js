require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const session = require('express-session');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '/')));

// Sessions
app.use(session({
    secret: process.env.SESSION_SECRET || 'betnixsecret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(()=>console.log('MongoDB connected'))
    .catch(err=>console.log(err));

// Business schema
const businessSchema = new mongoose.Schema({
    name: String,
    category: String,
    rating: Number,
    location: String,
    description: String,
    userId: String // link to Betnix user
});
const Business = mongoose.model('Business', businessSchema);

// API: Betnix login
app.post('/api/login', async (req,res)=>{
    const { email, password } = req.body;
    try {
        const response = await axios.post('https://api.betnix.com/auth/login', { email, password });
        if(response.data.success){
            req.session.user = response.data.user;
            res.json({ success:true, user: response.data.user });
        } else res.json({ success:false, message:'Invalid credentials' });
    } catch(err){ console.log(err); res.json({ success:false, message:'Betnix error' }); }
});

// API: Logout
app.post('/api/logout',(req,res)=>{
    req.session.destroy();
    res.json({ success:true });
});

// Get all businesses
app.get('/api/businesses', async (req,res)=>{
    const businesses = await Business.find({});
    res.json(businesses);
});

// Add business (only if logged in)
app.post('/api/businesses', async (req,res)=>{
    if(!req.session.user) return res.status(401).json({ success:false, message:'Not logged in' });
    const newBusiness = new Business({ ...req.body, userId:req.session.user.id });
    await newBusiness.save();
    res.json({ success:true, business:newBusiness });
});

// Serve frontend
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
