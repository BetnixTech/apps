import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, default: "" },
  birthday: { type: Date },
  address: { type: String, default: "" },
  notes: { type: String, default: "" },
  loginHistory: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("User", userSchema);
