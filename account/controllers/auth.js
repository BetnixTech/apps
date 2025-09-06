import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Signup
router.post('/signup', async (req,res)=>{
    const { name,email,password,phone,birthday,address,notes } = req.body;
    if(!email||!password) return res.status(400).json({success:false,message:'Email and password required'});
    const existing = await User.findOne({email});
    if(existing) return res.status(400).json({success:false,message:'Email already in use'});
    const hashed = await bcrypt.hash(password,10);
    const user = new User({name,email,password:hashed,phone,birthday,address,notes});
    await user.save();
    const token = jwt.sign({id:user._id,email:user.email},process.env.JWT_SECRET,{expiresIn:'2h'});
    res.json({success:true,token,user});
});

// Login
router.post('/login', async (req,res)=>{
    const {email,password} = req.body;
    const user = await User.findOne({email});
    if(!user) return res.status(400).json({success:false,message:'No account found'});
    const match = await bcrypt.compare(password,user.password);
    if(!match) return res.status(400).json({success:false,message:'Wrong password'});
    const token = jwt.sign({id:user._id,email:user.email},process.env.JWT_SECRET,{expiresIn:'2h'});
    res.json({success:true,token,user});
});

export default router;
