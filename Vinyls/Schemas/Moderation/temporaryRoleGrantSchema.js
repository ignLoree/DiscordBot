const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const temporaryRoleGrantSchema=new Schema({guildId:{type:String,required:true,index:true},userId:{type:String,required:true,index:true},roleId:{type:String,required:true,index:true},grantedBy:{type:String,default:null},removeOnExpire:{type:Boolean,default:true},expiresAt:{type:Date,required:true},},{timestamps:true},);

temporaryRoleGrantSchema.index(
  { guildId: 1, userId: 1, roleId: 1 },
  { unique: true },
);

temporaryRoleGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  models.temporary_role_grant ||
  model("temporary_role_grant", temporaryRoleGrantSchema);