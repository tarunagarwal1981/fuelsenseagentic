# Tool Configuration (DEPRECATED)

**DEPRECATION NOTICE:** YAML tool configurations are no longer loaded at runtime.

**Single source of truth:** TypeScript definitions in `frontend/lib/registry/tools/`

These YAML files are maintained for **documentation purposes only** and to support potential future config-based tooling. They are **NOT** used by the application at runtime.

**To add a new tool:**
1. Add TypeScript definition in `frontend/lib/registry/tools/[category]-tools.ts`
2. Register in `frontend/lib/registry/tools/index.ts`
3. Optionally update corresponding YAML for documentation

**To modify a tool:**
1. Edit the TypeScript definition (ONLY)
2. YAML will be synced manually when needed

**Rationale:**
- **Type safety:** Compile-time validation
- **Performance:** No YAML parsing overhead at runtime
- **Maintainability:** Single source, no sync issues
- **Developer experience:** IDE support, autocomplete
- **Scalability:** As you add 20–30+ tools, TypeScript scales better than maintaining parallel YAML
