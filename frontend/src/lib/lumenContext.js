import generatedView from "../data/ccac-dashboard-view-v1.1.generated.json";
import {
  PRESENTATION_UNAVAILABLE,
  buildCanonicalLumenContext as buildPortableContext,
  serializeCanonicalLumenContext as serializePortableContext,
} from "./lumenContextPortable.mjs";

export { PRESENTATION_UNAVAILABLE };
export const buildCanonicalLumenContext = (view = generatedView) => buildPortableContext(view);
export const serializeCanonicalLumenContext = (view = generatedView) => serializePortableContext(view);
