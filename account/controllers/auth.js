import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Middleware to verify JWT
function authMiddleware(req,res,next){
  const authHeader = req.headers['authorization'];
  if(!authHeader) return res.status(401).json({success:false,message:'No token'});
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token,process.env.JWT_SECRET);
    next();
  } catch(e){
    return res.status(401).json({success:false,message:'Invalid token'});
  }
}

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
  // Add login history
  user.loginHistory.push({date:new Date(),ip:req.ip});
  await user.save();
  res.json({success:true,token,user});
});

// Get profile
router.get('/profile', authMiddleware, async (req,res)=>{
  const user = await User.findById(req.user.id);
  if(!user) return res.status(404).json({success:false,message:'User not found'});
  res.json({success:true,user});
});

// Update profile
router.put('/profile', authMiddleware, async (req,res)=>{
  const { name, phone, birthday, address, notes } = req.body;
  const user = await User.findById(req.user.id);
  if(!user) return res.status(404).json({success:false,message:'User not found'});
  user.name = name;
  user.phone = phone;
  user.birthday = birthday;
  user.address = address;
  user.notes = notes;
  await user.save();
  res.json({success:true,message:'Profile updated'});
});

// Update password
router.put('/password', authMiddleware, async (req,res)=>{
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id);
  if(!user) return res.status(404).json({success:false,message:'User not found'});
  const match = await bcrypt.compare(currentPassword,user.password);
  if(!match) return res.status(400).json({success:false,message:'Wrong current password'});
  user.password = await bcrypt.hash(newPassword,10);
  await user.save();
  res.json({success:true,message:'Password updated'});
});

export default router;
