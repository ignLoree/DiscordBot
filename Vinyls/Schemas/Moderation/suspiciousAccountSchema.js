const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const suspiciousAccountSchema=new Schema({guildId:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},source:{type:String,default:"joingate"},reason:{type:String,default:""},markedAt:{type:Date,default:Date.now},expiresAt:{type:Date,default:null},},{timestamps:true},);

suspiciousAccountSchema.index({ guildId: 1, userId: 1 }, { unique: true });
// Pulisce automaticamente i flag sospetti scaduti
suspiciousAccountSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  models.SuspiciousAccount || model("SuspiciousAccount", suspiciousAccountSchema);