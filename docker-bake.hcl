# docker-bake.hcl - Multi-platform build configuration for cco-mcp

variable "REPO" {
  default = "cco-mcp"
}

variable "TAG" {
  default = "latest"
}

variable "REGISTRY" {
  default = ""
}

variable "PROJECT_ID" {
  default = ""
}

group "default" {
  targets = ["cco-mcp"]
}

# Local build target (single platform)
target "cco-mcp" {
  context = "."
  dockerfile = "Dockerfile"
  tags = REGISTRY != "" ? [
    "${REGISTRY}/${REPO}:${TAG}",
    "${REGISTRY}/${REPO}:latest"
  ] : [
    "${REPO}:${TAG}",
    "${REPO}:latest"
  ]
  platforms = []  # Single platform for local builds
  output = ["type=docker"]  # Output to local Docker daemon
  args = {
    BUILDKIT_INLINE_CACHE = "1"
  }
}

# Multi-platform registry build (for Google Artifact Registry)
target "cco-mcp-registry" {
  inherits = ["cco-mcp"]
  platforms = [
    "linux/amd64",
    "linux/arm64"
  ]
  output = ["type=registry"]  # Push directly to registry
  # BuildKit inline cache is already enabled via args in the base target
}

# Development build (builds only the builder stage)
target "dev" {
  inherits = ["cco-mcp"]
  tags = ["${REPO}:dev"]
  target = "builder"
}

# Local tagged build
target "local" {
  inherits = ["cco-mcp"]
  tags = ["${REPO}:local"]
}