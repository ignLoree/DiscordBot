const mongoose = require("mongoose");
const { Schema, model, models } = mongoose;

const noDmPreferenceSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    /** Categorie disattivate: "all" = nessun DM; altrimenti es. ["weekly","bump"]. Vuoto/assente = legacy "block all". */
    categories: { type: [String], default: null },
  },
  { timestamps: true },
);

noDmPreferenceSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports =
  models.NoDmPreference || model("NoDmPreference", noDmPreferenceSchema);