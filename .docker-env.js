#!/usr/bin/env node

// This script outputs the Docker registry URL based on environment variables
// It's used by npm scripts to dynamically set the registry for docker push operations

const region = process.env.GCP_REGION;
const projectId = process.env.GCP_PROJECT_ID;

if (!region || !projectId) {
  console.error(
    "Error: GCP_REGION and GCP_PROJECT_ID environment variables must be set"
  );
  console.error(
    "This script should be run with Doppler: doppler run -- npm run docker:push"
  );
  process.exit(1);
}

const registry = `${region}-docker.pkg.dev/${projectId}/cco-mcp`;
console.log(registry);
