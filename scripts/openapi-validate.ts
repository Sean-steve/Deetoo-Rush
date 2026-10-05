/**
 * Validates openapi/openapi.yaml is structurally well-formed OpenAPI (every $ref resolves, the
 * document matches the OpenAPI 3.x meta-schema) using @apidevtools/swagger-parser rather than a
 * hand-rolled check. This only proves the file is valid OpenAPI -- it says nothing about whether
 * an individual operation's schema is accurate to its handler. See scripts/openapi-coverage-check.ts
 * for the complementary route-drift check.
 */
import SwaggerParser from '@apidevtools/swagger-parser';

async function main(): Promise<void> {
  try {
    const api = (await SwaggerParser.validate('openapi/openapi.yaml')) as { openapi: string; paths?: Record<string, unknown> };
    const pathCount = Object.keys(api.paths || {}).length;
    console.log(`openapi-validate: OK -- valid OpenAPI ${api.openapi}, ${pathCount} paths, all $refs resolve.`);
  } catch (error) {
    console.error('openapi-validate: FAILED');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
