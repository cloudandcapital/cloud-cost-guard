import generatedView from "../data/ccac-dashboard-view-v1.1.generated.json";
import {
  CCAC11_VIEW_SCHEMA,
  SOURCE_REPORT_SHA256,
  FINAL_MANIFEST_SHA256,
  REPORT_PROVENANCE_MANIFEST_SHA256,
  CanonicalViewError,
  createCcac11PresentationModel,
} from "./ccac11PresentationModelPortable.mjs";

export {
  CCAC11_VIEW_SCHEMA,
  SOURCE_REPORT_SHA256,
  FINAL_MANIFEST_SHA256,
  REPORT_PROVENANCE_MANIFEST_SHA256,
  CanonicalViewError,
  createCcac11PresentationModel,
};

export const getCcac11PresentationModel = () => createCcac11PresentationModel(generatedView);
