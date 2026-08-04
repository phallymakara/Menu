---
trigger: manual
---

## Backend Project Code Review and Refactoring Instructions

Review the entire backend and the connection url of the project and improve its code quality, maintainability, structure, and production readiness.

### 1. Review the Project Structure

* Inspect the current backend folder and file organization.
* Verify that the project follows a clear and scalable architecture.
* Identify files or modules that are placed in the wrong location.
* Recommend and implement structural changes when necessary.
* Keep responsibilities separated between routes, services, repositories, models, schemas, configuration, utilities, and other relevant layers.
* Follow the engineering architecture and design patterns.

### 2. Analyze and Refactor Large Files

* Review each backend source file for excessive length or mixed responsibilities.
* Split large files into smaller, focused modules when appropriate.
* Ensure that each class, function, and module has a clear responsibility.
* Avoid unnecessary abstraction or creating too many very small files.
* Preserve the existing behavior while refactoring.

### 3. Improve Comments and Documentation

* Add clear docstrings to public modules, classes, methods, and functions.
* Add comments only where the logic or business rule is not immediately clear.
* Remove unnecessary, outdated, duplicated, or misleading comments.
* Remove all emojis from source code, comments, logs, API responses, error messages, and documentation.
* Keep documentation professional and technically accurate.

### 4. Enforce Consistent Code Patterns

* Ensure the code follows the project's established structure, naming conventions, and design patterns.
* Check for duplicated logic and move reusable behavior into appropriate shared modules.
* Ensure error handling, logging, validation, dependency injection, and database access follow consistent patterns.
* Avoid mixing business logic directly inside API routes.
* Use appropriate typing and return types throughout the codebase.

### 5. Remove Hard-Coded Values

Check the entire backend project for hard-coded values, including:

* API URLs
* Database connection strings
* Ports
* API keys and secrets
* Model names
* File paths
* Storage URLs
* CORS origins
* Environment-specific settings
* Timeout values
* Pagination limits
* Email addresses
* External service endpoints

Move environment-dependent values into environment variables or centralized configuration files.

Do not move genuine business constants into environment variables unless they are expected to change between environments.

### 6. Add Proper Logging

* Add centralized and consistent logging across the backend.
* Replace `print()` statements with the project's logging system.
* Use appropriate log levels such as `DEBUG`, `INFO`, `WARNING`, `ERROR`, and `CRITICAL`.
* Add useful logs for application startup, shutdown, database connections, external service calls, important business operations, and unexpected errors.
* Include useful context such as request IDs, endpoints, resource IDs, and execution duration where appropriate.
* Do not log API keys, access tokens, passwords, connection strings, authorization headers, or sensitive user information.
* Make the log level and log format configurable for development, testing, staging, and production.
* Avoid duplicated logs and unnecessary verbose logging.

### 7. Review URL and Connection Configuration

* Ensure database, storage,  external API connections use centralized configuration.
* Avoid requiring source-code changes when deploying to development, staging, or production.
* Use environment-specific configuration such as `.env`, `.env.development`, `.env.production`, or deployment platform variables.
* Ensure environment variables are validated during application startup.
* Provide safe and meaningful errors when required configuration is missing.
* Do not expose secrets in logs, exceptions, API responses, or version control.
* Update `.env.example` with all required variables using safe placeholder values.


### 10. Required Output

Before modifying the code, provide:

1. A summary of the current backend architecture.
2. The main problems found.
3. The recommended changes.
4. The files that will be modified, created, moved, or removed.

After making the changes, provide:

1. A summary of completed improvements.
2. A list of modified files and the reason for each change.
3. Any remaining risks or recommendations.
4. The results of linting, type checking, testing, and build validation.

Make changes carefully and incrementally. Do not rewrite the entire project unnecessarily. Preserve working functionality and explain any important architectural decisions.
