const importedCore = require("./lumenContextPortable");
const portableCore = importedCore.default || importedCore;

export const {
  PRESENTATION_UNAVAILABLE,
  buildCanonicalLumenContext,
  serializeCanonicalLumenContext,
} = portableCore;
