const mongoose=require("mongoose");
const EmailSchema=new mongoose.Schema({from:String,to:String,subject:String,body:String,date:{type:Date,default:Date.now},read:{type:Boolean,default:false}});
module.exports=mongoose.model("Email",EmailSchema);
