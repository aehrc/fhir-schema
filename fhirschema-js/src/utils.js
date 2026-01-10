/**
 * Utility functions for loading FHIR Schema packages from the registry.
 *
 * Uses the fetch API and DecompressionStream for browser and Node.js compatibility.
 *
 * @author John Grimes
 */

const packageRegistryUrl =
  "https://storage.googleapis.com/fhir-schema-registry/1.0.0/";

/**
 * Builds the URL for a package's NDJSON.gz file.
 *
 * @param {string} packageCoordinate - Package coordinate (e.g., "hl7.fhir.r4.core#4.0.1").
 * @returns {string} The URL for the package file.
 */
function buildPackageFileUrl(packageCoordinate) {
  return `${packageRegistryUrl}${encodeURIComponent(packageCoordinate)}/package.ndjson.gz`;
}

/**
 * Fetches and decompresses a gzipped NDJSON file, returning a specific line.
 *
 * @param {string} url - The URL to fetch.
 * @param {number} targetLine - The 1-based line number to retrieve.
 * @returns {Promise<Object|null>} The parsed JSON object from the target line, or null if not found.
 */
async function getSpecificLineFromNdjson(url, targetLine) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const reader = response.body
      .pipeThrough(new DecompressionStream("gzip"))
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let currentLine = 0;
    let lineBuffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      lineBuffer += value;

      while (lineBuffer.indexOf("\n") !== -1) {
        const newlineIndex = lineBuffer.indexOf("\n");
        const line = lineBuffer.slice(0, newlineIndex);
        lineBuffer = lineBuffer.slice(newlineIndex + 1);
        currentLine++;

        if (currentLine === targetLine) {
          reader.cancel();
          return JSON.parse(line);
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Gets the package metadata (first line of the NDJSON file).
 *
 * @param {string} packageCoordinate - Package coordinate.
 * @returns {Promise<Object|null>} The package metadata object.
 */
async function getPackageMeta(packageCoordinate) {
  return await getSpecificLineFromNdjson(
    buildPackageFileUrl(packageCoordinate),
    1,
  );
}

/**
 * Gets the dependencies for a package.
 *
 * @param {string} packageCoordinate - Package coordinate.
 * @returns {Promise<string[]>} Array of dependency package coordinates.
 */
async function getPackageDeps(packageCoordinate) {
  const packageMeta = await getPackageMeta(packageCoordinate);
  if (!packageMeta) {
    return [];
  }
  const packageDeps = normalizePackageDeps(packageMeta.dependencies);
  return packageDeps;
}

/**
 * Normalizes package dependencies by removing the leading character.
 *
 * @param {string[]|undefined} packageDeps - Raw dependency array.
 * @returns {string[]} Normalized dependency array.
 */
function normalizePackageDeps(packageDeps) {
  return packageDeps ? packageDeps.map((d) => d.slice(1)) : [];
}

/**
 * Identity function.
 *
 * @param {*} x - Input value.
 * @returns {*} The same value.
 */
function identity(x) {
  return x;
}

/**
 * Returns the difference between two sets.
 *
 * @param {Set} setA - First set.
 * @param {Set} setB - Second set.
 * @returns {Set} Elements in setA that are not in setB.
 */
function difference(setA, setB) {
  return new Set([...setA].filter((x) => !setB.has(x)));
}

/**
 * Recursively resolves all dependencies for a set of packages.
 *
 * @param {Set<string>} visitedDeps - Already visited dependencies.
 * @param {Set<string>} enqueuedDeps - Dependencies to process.
 * @returns {Promise<string[]>} All resolved dependencies.
 */
async function dependencyResolver(visitedDeps, enqueuedDeps) {
  if (enqueuedDeps.size === 0) {
    return Array.from(visitedDeps);
  } else {
    const promisifiedDeps = Array.from(enqueuedDeps).map(getPackageDeps);

    const resolvedPromises = await Promise.all(promisifiedDeps);

    const childDeps = new Set(resolvedPromises.flat().filter(identity));

    return await dependencyResolver(
      new Set([...visitedDeps, ...enqueuedDeps]),
      new Set(Array.from(difference(childDeps, new Set(visitedDeps)))),
    );
  }
}

/**
 * Resolves all dependencies for a set of package coordinates.
 *
 * @param {string[]} packageCoordinates - Package coordinates.
 * @returns {Promise<string[]>} All packages including dependencies.
 */
async function resolveDeps(packageCoordinates) {
  const fullDepsTree = await dependencyResolver(
    new Set(),
    new Set(packageCoordinates),
  );
  return fullDepsTree;
}

/**
 * Loads all FHIR Schema entries from a package's NDJSON.gz file into a map.
 *
 * The package format contains metadata and StructureDefinitions first, followed
 * by a delimiter line ["fhir-schema/delimiter"], then FHIR Schema entries.
 *
 * @param {string} packageCoordinate - Package coordinate (e.g., "hl7.fhir.r4.core#4.0.1").
 * @returns {Promise<Object>} Map of schema name/URL to schema object.
 */
async function loadPackageSchemas(packageCoordinate) {
  const url = buildPackageFileUrl(packageCoordinate);
  const schemas = {};

  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`Package not found in registry: ${packageCoordinate}`);
    return schemas;
  }

  const reader = response.body
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeThrough(new TextDecoderStream())
    .getReader();

  let buffer = "";
  let pastDelimiter = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += value;
    let newlineIndex;

    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (!line.trim()) continue;

      // Check for the FHIR Schema delimiter.
      if (line.includes("fhir-schema/delimiter")) {
        pastDelimiter = true;
        continue;
      }

      // Only process FHIR Schema entries after the delimiter.
      // FHIR Schemas have 'elements' as an object, or are primitive types.
      // StructureDefinitions have 'differential' instead.
      if (pastDelimiter) {
        const schema = JSON.parse(line);
        const hasElements =
          schema.elements &&
          typeof schema.elements === "object" &&
          !Array.isArray(schema.elements);
        const isPrimitive = schema.kind === "primitive-type";
        if (hasElements || isPrimitive) {
          if (schema.name) schemas[schema.name] = schema;
          if (schema.url) schemas[schema.url] = schema;
        }
      }
    }
  }

  return schemas;
}

/**
 * Creates a validation context by loading schemas from remote FHIR Schema packages.
 *
 * @param {string[]} packageCoordinates - Package coordinates (e.g., ["hl7.fhir.r4.core#4.0.1"]).
 * @returns {Promise<Object>} Context object with schemaResolver.
 */
async function createContext(packageCoordinates) {
  // Resolve full dependency tree.
  const allPackages = await resolveDeps(packageCoordinates);

  // Load schemas from all packages in parallel.
  const schemaArrays = await Promise.all(allPackages.map(loadPackageSchemas));

  // Merge all schemas into a single map (later packages override earlier).
  const allSchemas = {};
  for (const schemas of schemaArrays) {
    Object.assign(allSchemas, schemas);
  }

  return {
    schemaResolver: (schemaName) => allSchemas[schemaName],
  };
}

export default { resolveDeps, createContext };
