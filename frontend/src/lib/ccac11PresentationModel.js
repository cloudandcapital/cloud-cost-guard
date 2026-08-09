const importedCore = require("./ccac11PresentationModelPortable");
const portableCore = importedCore.default || importedCore;

export const {
  CCAC11_VIEW_SCHEMA,
  SOURCE_REPORT_SHA256,
  FINAL_MANIFEST_SHA256,
  REPORT_PROVENANCE_MANIFEST_SHA256,
  CanonicalViewError,
  createCcac11PresentationModel,
  getCcac11PresentationModel,
} = portableCore;
