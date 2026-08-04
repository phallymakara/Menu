---
trigger: manual
---

Backend Project Code Review and Refactoring Instructions

Review the entire backend and the connection url of the project and improve its code quality, maintainability, structure, and production readiness.

1. Review the Project Structure
Inspect the current backend folder and file organization.
Verify that the project follows a clear and scalable architecture.
Identify files or modules that are placed in the wrong location.
Recommend and implement structural changes when necessary.
Keep responsibilities separated between routes, services, repositories, models, schemas, configuration, utilities, and other relevant layers.
Follow the engineering architecture and design patterns.
2. Analyze and Refactor Large Files
Review each backend source file for excessive length or mixed responsibilities.
Split large files into smaller, focused modules when appropriate.
Ensure that each class, function, and module has a clear responsibility.
Avoid unnecessary abstraction or creating too many very small files.
Preserve the existing behavior while refactoring.
3. Improve Comments and Documentation
Add clear docstrings to public modules, classes, methods, and functions.
Add comments only where the logic or business rule is not immediately clear.
Remove unnecessary, outdated, duplicated, or misleading comments.
Remove all emojis from source code, comments, logs, API responses, error messages, and documentation.
Keep documentation professional and technically accurate.
4. Enforce Consistent Code Patterns
Ensure the code follows the project's established structure, naming conventions, and design patterns.
Check for duplicated logic and move reusable behavior into appropriate shared modules.
Ensure error handling, logging, validation, dependency injection, and database access follow consistent patterns.
Avoid mixing business logic directly inside API routes.
Use appropriate typing and return types throughout the codebase.
5. Remove Hard-Coded Values

Check the entire backend project for hard-coded values, including:

API URLs
Database connection strings
Ports
API keys and secrets
Model names
File paths
Storage URLs
CORS origins
Environment-specific settings
Timeout values
Pagination limits
Email addresses
External service endpoints

Move environment-dependent values into environment variables or centralized configuration files.

Do not move genuine business constants into environment variables unless they are expected to change between environments.

6. Add Proper Logging
Review the existing logging architecture and ensure all backend modules use one centralized logging configuration.
Use structured logging with consistent event names and contextual fields.
Replace print() statements and direct console output with the project logging system.
Use appropriate log levels:
DEBUG for detailed development diagnostics.
INFO for application lifecycle events and successful important operations.
WARNING for expected failures, rejected operations, suspicious behavior, and recoverable problems.
ERROR for failed operations and unexpected exceptions.
CRITICAL for unrecoverable startup, configuration, or infrastructure failures.
Log application startup, shutdown, configuration loading, database availability, external service calls, authentication outcomes, authorization failures, validation failures, important business operations, and unexpected exceptions.
Include useful debugging context where appropriate, such as:
request ID
HTTP method
endpoint path
response status code
execution duration
safe user ID
safe organization ID
safe resource ID
error type
safe failure reason
Ensure every request can be traced from start to completion using the same request ID.
Log unexpected exceptions with stack traces for debugging.
Add safe and meaningful log events for common failure responses such as 401, 403, 404, 409, 422, 500, and 503.
Do not reveal whether a specific email address or phone number exists during authentication failures.
Never log:
passwords
password hashes
access tokens
refresh tokens
API keys
secret keys
database connection strings
authorization headers
cookies
full request bodies
email addresses
phone numbers
sensitive SQL query parameters
Mask or remove sensitive values before writing logs.
Avoid duplicated logging, especially duplicated SQLAlchemy and structured log records.
Ensure SQL statements and bind parameters are not logged in staging or production.
Keep verbose SQL logging optional and limited to local development.
Use one consistent timestamp format and timezone across all loggers, preferably UTC.
Make the log level and log format configurable for development, testing, staging, and production.
Support readable console logs for local development and structured JSON logs for staging and production when appropriate.
Add configurable slow-request and slow-database-operation thresholds.
Log slow operations with their duration and safe context.
Avoid excessive logs for health checks, documentation endpoints, static files, and other high-frequency low-value requests unless debugging is enabled.
Ensure logging failures never break request processing or application startup.
Verify that logs remain useful for debugging without exposing internal implementation details to API clients.
7. Review URL and Connection Configuration
Ensure database, storage, external API connections use centralized configuration.
Avoid requiring source-code changes when deploying to development, staging, or production.
Use environment-specific configuration such as .env, .env.development, .env.production, or deployment platform variables.
Ensure environment variables are validated during application startup.
Provide safe and meaningful errors when required configuration is missing.
Do not expose secrets in logs, exceptions, API responses, or version control.
Update .env.example with all required variables using safe placeholder values.
