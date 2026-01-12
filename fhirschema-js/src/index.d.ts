/**
 * TypeScript type definitions for fhir-schema-js.
 *
 * @author John Grimes
 */

/**
 * Context object containing a schema resolver function.
 */
export interface FhirSchemaContext {
  schemaResolver: (schemaName: string) => FhirSchema | undefined;
}

/**
 * FHIR Schema definition structure.
 */
export interface FhirSchema {
  name?: string;
  url?: string;
  base?: string;
  type?: string;
  kind?: "primitive-type" | "complex-type" | "resource" | "logical";
  elements?: Record<string, FhirElementDefinition>;
  required?: string[];
  excluded?: string[];
  constraints?: Record<string, FhirConstraint>;
  extensions?: Record<string, FhirExtensionDefinition>;
}

/**
 * Element definition within a FHIR Schema.
 */
export interface FhirElementDefinition {
  type?: string;
  array?: boolean;
  scalar?: boolean;
  min?: number;
  max?: number | string;
  binding?: FhirBinding;
  required?: string[];
  excluded?: string[];
  fixed?: unknown;
  pattern?: unknown;
  constraints?: Record<string, FhirConstraint>;
  refers?: string[];
  choices?: string[];
  choiceOf?: string;
  modifier?: boolean;
  mustSupport?: boolean;
  summary?: boolean;
  path?: string;
  short?: string;
  definition?: string;
}

/**
 * Terminology binding for coded elements.
 */
export interface FhirBinding {
  valueSet: string;
  strength: "required" | "extensible" | "preferred" | "example";
}

/**
 * FHIRPath constraint definition.
 */
export interface FhirConstraint {
  expression: string;
  severity: "error" | "warning";
  human?: string;
}

/**
 * Extension definition within a FHIR Schema.
 */
export interface FhirExtensionDefinition {
  url: string;
  min?: number;
  max?: number | string;
}

/**
 * Enumerated element returned by enumerateElements, including nested
 * element expansion and schema origin tracking.
 */
export interface EnumeratedElement {
  type?: string;
  array?: boolean;
  scalar?: boolean;
  min?: number;
  max?: number | string;
  binding?: FhirBinding;
  required?: string[];
  excluded?: string[];
  fixed?: unknown;
  pattern?: unknown;
  constraints?: Record<string, FhirConstraint>;
  refers?: string[];
  choices?: string[];
  choiceOf?: string;
  modifier?: boolean;
  mustSupport?: boolean;
  summary?: boolean;
  path?: string;
  short?: string;
  definition?: string;
  /** Array of schema names that define or constrain this element. */
  definedIn?: string[];
  /** Nested elements for complex types. */
  elements?: Record<string, EnumeratedElement>;
  /** Slicing information for extensions. */
  slicing?: {
    slices: Record<
      string,
      {
        url?: string;
        min?: number;
        max?: number | string;
      }
    >;
  };
}

/**
 * Validation error returned by validate and validateElementValue.
 */
export interface ValidationError {
  type: string;
  path: string | string[];
  message?: string;
  [key: string]: unknown;
}

/**
 * Result of validation operations.
 */
export interface ValidationResult {
  errors: ValidationError[];
}

/**
 * Enumerates all elements of a schema (including inherited elements) and
 * returns their metadata in a nested structure mirroring the schema hierarchy.
 *
 * @param ctx - Context object with schemaResolver callback.
 * @param schemaNames - Array of schema names/URLs to enumerate.
 * @returns Nested element structure with type, binding, and other metadata.
 */
export function enumerateElements(
  ctx: FhirSchemaContext,
  schemaNames: string[],
): Record<string, EnumeratedElement>;

/**
 * Validates a complete FHIR resource against one or more schemas.
 *
 * @param ctx - Context object with schemaResolver callback.
 * @param schemaNames - Array of schema names/URLs to validate against.
 * @param data - The FHIR resource to validate.
 * @returns Validation result with errors array.
 */
export function validate(
  ctx: FhirSchemaContext,
  schemaNames: string[],
  data: unknown,
): ValidationResult;
