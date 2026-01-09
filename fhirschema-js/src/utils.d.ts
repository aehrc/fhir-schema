/**
 * TypeScript type definitions for fhir-schema-js utilities.
 *
 * @author John Grimes
 */

import { FhirSchemaContext } from "./index";

/**
 * Utility functions for loading FHIR Schema packages from remote registry.
 */
export interface FhirSchemaUtils {
  /**
   * Resolves the full dependency tree for the given package coordinates.
   *
   * @param packageCoordinates - Package coordinates, e.g., ["hl7.fhir.r4.core#4.0.1"].
   * @returns Promise resolving to array of all package coordinates including dependencies.
   */
  resolveDeps(packageCoordinates: string[]): Promise<string[]>;

  /**
   * Creates a validation context by loading schemas from remote FHIR Schema packages.
   *
   * @param packageCoordinates - Package coordinates, e.g., ["hl7.fhir.r4.core#4.0.1"].
   * @returns Promise resolving to context object with schemaResolver.
   */
  createContext(packageCoordinates: string[]): Promise<FhirSchemaContext>;
}

declare const utils: FhirSchemaUtils;
export default utils;
