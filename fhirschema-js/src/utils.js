import https from "https";
import zlib from "zlib";

const packageRegistryUrl =
  "https://storage.googleapis.com/fhir-schema-registry/1.0.0/";

function buildPackageFileUrl(packageCoordinate) {
  return `${packageRegistryUrl}${encodeURIComponent(packageCoordinate)}/package.ndjson.gz`;
}

async function getSpecificLineFromNdjson(url, targetLine) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          return resolve(null);
        }

        const gunzip = zlib.createGunzip();
        const stream = response.pipe(gunzip);

        let currentLine = 0;
        let lineBuffer = "";

        stream.on("data", (chunk) => {
          lineBuffer += chunk.toString();

          while (lineBuffer.indexOf("\n") !== -1) {
            const newlineIndex = lineBuffer.indexOf("\n");
            const line = lineBuffer.slice(0, newlineIndex); // drop \n
            lineBuffer = lineBuffer.slice(newlineIndex + 1);
            currentLine++;

            if (currentLine === targetLine) {
              try {
                const parsedLine = JSON.parse(line);
                stream.destroy();
                return resolve(parsedLine);
              } catch (err) {
                return reject(
                  new Error("Failed to parse JSON: " + err.message),
                );
              }
            }
          }
        });

        stream.on("end", () => {
          if (currentLine < targetLine) {
            reject(`Finished preliminary, before target line#: ${targetLine}`);
          }
        });

        stream.on("error", (err) => {
          reject(err);
        });
      })
      .on("error", (err) => {
        resolve(null);
      });
  });
}

async function getPackageMeta(packageCoordinate) {
  return await getSpecificLineFromNdjson(
    buildPackageFileUrl(packageCoordinate),
    1,
  );
}

async function getPackageDeps(packageCoordinate) {
  const packageMeta = await getPackageMeta(packageCoordinate);
  if (!packageMeta) {
    return [];
  }
  const packageDeps = normalizePackageDeps(packageMeta.dependencies);
  return packageDeps;
}

function normalizePackageDeps(packageDeps) {
  return packageDeps ? packageDeps.map((d) => d.slice(1)) : [];
}

function identity(x) {
  return x;
}

function difference(setA, setB) {
  return new Set([...setA].filter((x) => !setB.has(x)));
}

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

async function obtainPackageDeps(packageCoordinate) {
  const rootDeps = await getPackageDeps(packageCoordinate);
  const fullDepsTree = await dependencyResolver(new Set(), new Set(rootDeps));
  return fullDepsTree;
}

async function resolveDeps(packageCoordinates) {
  const fullDepsTree = await dependencyResolver(
    new Set(),
    new Set(packageCoordinates),
  );
  return fullDepsTree;
}

/**
 * Loads all FHIR Schema entries from a package's NDJSON.gz file into a map.
 * The package format contains metadata and StructureDefinitions first, followed
 * by a delimiter line ["fhir-schema/delimiter"], then FHIR Schema entries.
 *
 * @param {string} packageCoordinate - Package coordinate (e.g., "hl7.fhir.r4.core#4.0.1").
 * @returns {Promise<Object>} Map of schema name/URL to schema object.
 */
async function loadPackageSchemas(packageCoordinate) {
  const url = buildPackageFileUrl(packageCoordinate);
  const schemas = {};

  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          return reject(
            new Error(`Failed to fetch package: ${packageCoordinate}`),
          );
        }

        const gunzip = zlib.createGunzip();
        const stream = response.pipe(gunzip);
        let buffer = "";
        let pastDelimiter = false;

        stream.on("data", (chunk) => {
          buffer += chunk.toString();
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
        });

        stream.on("end", () => resolve(schemas));
        stream.on("error", reject);
      })
      .on("error", reject);
  });
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
